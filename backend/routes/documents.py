import os
import uuid
import hashlib
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, UploadFile, File, HTTPException, BackgroundTasks, Query
from fastapi.responses import JSONResponse

from backend.config import UPLOAD_DIR, MAX_UPLOAD_SIZE_BYTES, MAX_UPLOAD_SIZE_MB, ALLOWED_EXTENSIONS
from backend.database import (
    insert_document,
    get_all_documents,
    get_document_by_id,
    get_document_by_hash,
    get_claims_by_document,
    get_sections_by_document,
    delete_document as db_delete_document
)
from backend.models import (
    DocumentSummary,
    DocumentDetail,
    DocumentListResponse,
    ClaimsResponse,
    SectionsResponse,
    ProcessResponse
)
from backend.services.pipeline import DocumentProcessingPipeline

router = APIRouter(prefix="/api/documents", tags=["Documents"])
logger = logging.getLogger(__name__)
pipeline = DocumentProcessingPipeline()

def compute_file_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()

@router.post("/upload")
async def upload_documents(files: List[UploadFile] = File(...)):
    """
    Upload one or multiple documents (PDF, DOCX, XLSX).
    Validates file format, size, checks for duplicates, and records in SQLite.
    """
    if not files:
        raise HTTPException(status_code=400, detail="No files provided in upload request.")

    uploaded_records = []
    errors = []

    for file in files:
        filename = file.filename or "unknown"
        ext = filename.split(".")[-1].lower() if "." in filename else ""

        # Validate extension
        if ext not in ALLOWED_EXTENSIONS:
            errors.append(f"'{filename}': Unsupported file format .{ext}. Allowed: PDF, DOCX, XLSX")
            continue

        try:
            content = await file.read()
            file_size = len(content)

            # Validate file size
            if file_size == 0:
                errors.append(f"'{filename}': File is empty (0 bytes).")
                continue

            if file_size > MAX_UPLOAD_SIZE_BYTES:
                errors.append(f"'{filename}': File size ({round(file_size/(1024*1024), 2)}MB) exceeds limit of {MAX_UPLOAD_SIZE_MB}MB.")
                continue

            # Check duplicate hash
            file_hash = compute_file_hash(content)
            existing_doc = get_document_by_hash(file_hash)
            if existing_doc:
                # We can either reuse or indicate duplicate
                uploaded_records.append({
                    "id": existing_doc["id"],
                    "filename": existing_doc["filename"],
                    "type": existing_doc["type"],
                    "size": existing_doc["size"],
                    "upload_time": existing_doc["upload_time"],
                    "status": existing_doc["status"],
                    "is_duplicate": True,
                    "message": "File already exists in system."
                })
                continue

            # Save file to disk
            doc_id = str(uuid.uuid4())
            safe_filename = f"{doc_id}_{filename}"
            save_path = UPLOAD_DIR / safe_filename
            save_path.write_bytes(content)

            upload_time = datetime.now(timezone.utc).isoformat()
            doc_record = {
                "id": doc_id,
                "filename": filename,
                "file_path": str(save_path),
                "file_hash": file_hash,
                "type": ext.upper(),
                "size": file_size,
                "upload_time": upload_time,
                "status": "Uploaded",
                "extracted_text": "",
                "section_count": 0,
                "claim_count": 0,
                "error": None
            }

            insert_document(doc_record)
            uploaded_records.append(doc_record)

        except Exception as e:
            logger.error("Failed to save uploaded file %s: %s", filename, str(e))
            errors.append(f"'{filename}': Failed to save: {str(e)}")

    if not uploaded_records and errors:
        raise HTTPException(status_code=400, detail={"errors": errors})

    return {
        "success": True,
        "uploaded_count": len(uploaded_records),
        "documents": uploaded_records,
        "warnings": errors if errors else None
    }

@router.post("/load-samples")
def load_sample_documents():
    """
    Convenience endpoint to load generated benchmark sample files (PDF, DOCX, XLSX).
    """
    from backend.config import BASE_DIR
    samples_dir = BASE_DIR / "sample_files"
    if not samples_dir.exists():
        raise HTTPException(status_code=404, detail="sample_files directory does not exist.")

    files = list(samples_dir.glob("*.pdf")) + list(samples_dir.glob("*.docx")) + list(samples_dir.glob("*.xlsx"))
    if not files:
        raise HTTPException(status_code=404, detail="No sample files found.")

    loaded = []
    for f in files:
        content = f.read_bytes()
        f_hash = compute_file_hash(content)
        existing = get_document_by_hash(f_hash)
        if existing:
            loaded.append(existing)
            continue

        doc_id = str(uuid.uuid4())
        ext = f.suffix.lstrip(".").lower()
        save_path = UPLOAD_DIR / f"{doc_id}_{f.name}"
        save_path.write_bytes(content)

        upload_time = datetime.now(timezone.utc).isoformat()
        doc_record = {
            "id": doc_id,
            "filename": f.name,
            "file_path": str(save_path),
            "file_hash": f_hash,
            "type": ext.upper(),
            "size": len(content),
            "upload_time": upload_time,
            "status": "Uploaded",
            "extracted_text": "",
            "section_count": 0,
            "claim_count": 0,
            "error": None
        }
        insert_document(doc_record)
        loaded.append(doc_record)

    return {"success": True, "loaded_count": len(loaded), "documents": loaded}

@router.get("", response_model=DocumentListResponse)
def list_documents():
    """
    Retrieve all documents from SQLite with their current processing status and metrics.
    """
    docs = get_all_documents()
    summaries = [
        DocumentSummary(
            id=d["id"],
            filename=d["filename"],
            type=d["type"],
            size=d["size"],
            upload_time=d["upload_time"],
            status=d["status"],
            section_count=d.get("section_count", 0),
            claim_count=d.get("claim_count", 0),
            error=d.get("error")
        )
        for d in docs
    ]
    return DocumentListResponse(documents=summaries, total=len(summaries))

@router.get("/{document_id}", response_model=DocumentDetail)
def get_document(document_id: str):
    """
    Retrieve detailed metadata and extracted text for a specific document.
    """
    doc = get_document_by_id(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found.")
    return DocumentDetail(**doc)

@router.post("/{document_id}/process", response_model=ProcessResponse)
def process_document(document_id: str):
    """
    Process a document: parses PDF/DOCX/XLSX, ingests sections, extracts real claims, and saves to SQLite.
    """
    doc = get_document_by_id(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found.")

    res = pipeline.process_document(document_id)
    return ProcessResponse(**res)

@router.post("/process-all")
def process_all_documents():
    """
    Batch process all documents currently in 'Uploaded' or 'Failed' state.
    """
    results = pipeline.process_all_pending()
    return results

@router.get("/{document_id}/claims", response_model=ClaimsResponse)
def get_document_claims(
    document_id: str,
    claim_type: Optional[str] = Query(None, description="Filter by claim type"),
    min_confidence: Optional[float] = Query(None, description="Filter by minimum confidence")
):
    """
    Retrieve extracted claims for a document with optional filtering by type or confidence.
    """
    doc = get_document_by_id(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found.")

    claims = get_claims_by_document(document_id)

    if claim_type and claim_type != "All":
        claims = [c for c in claims if c["claim_type"].lower() == claim_type.lower()]

    if min_confidence is not None:
        claims = [c for c in claims if c["confidence"] >= min_confidence]

    return ClaimsResponse(
        document_id=document_id,
        filename=doc["filename"],
        claims=claims,
        total_claims=len(claims)
    )

@router.get("/{document_id}/sections", response_model=SectionsResponse)
def get_document_sections(document_id: str):
    """
    Retrieve structured parsed sections (pages, paragraphs, sheets) for a document.
    """
    doc = get_document_by_id(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found.")

    sections = get_sections_by_document(document_id)
    return SectionsResponse(
        document_id=document_id,
        sections=sections,
        total_sections=len(sections)
    )

@router.delete("/{document_id}")
def delete_document_endpoint(document_id: str):
    """
    Delete a document, its database entries, and its uploaded file from disk.
    """
    doc = get_document_by_id(document_id)
    if not doc:
        raise HTTPException(status_code=404, detail=f"Document '{document_id}' not found.")

    # Remove physical file if exists
    try:
        file_path = Path(doc["file_path"])
        if file_path.exists():
            file_path.unlink()
    except Exception as e:
        logger.warning("Could not delete physical file for doc %s: %s", document_id, str(e))

    deleted = db_delete_document(document_id)
    return {"success": deleted, "message": f"Document '{doc['filename']}' deleted successfully."}
