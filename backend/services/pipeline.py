import os
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Dict, Any, Optional

from backend.database import (
    get_document_by_id,
    update_document_status,
    update_document_results,
    save_sections,
    save_claims
)
from backend.parsers.factory import get_parser
from backend.services.claim_extractor import ClaimExtractorService

logger = logging.getLogger(__name__)

class DocumentProcessingPipeline:
    """
    Orchestrates the ingestion, parsing, claim extraction, and persistence pipeline.
    Ensures modularity so future features (entity linking, graphs, comparison)
    can plug directly into the extracted sections or claims without redesign.
    """

    def __init__(self):
        self.claim_extractor = ClaimExtractorService()

    def process_document(self, document_id: str) -> Dict[str, Any]:
        """
        Executes complete ingestion & extraction pipeline for a single document.
        """
        doc = get_document_by_id(document_id)
        if not doc:
            raise ValueError(f"Document with ID '{document_id}' not found.")

        # Update status to Processing
        update_document_status(document_id, "Processing")

        try:
            file_path = Path(doc["file_path"])
            if not file_path.exists():
                raise FileNotFoundError(f"Source file not found on disk at: {file_path}")

            # 1. Select appropriate parser and parse document
            file_type = doc["type"]
            parser = get_parser(file_type)
            sections = parser.parse(file_path, document_id)

            if not sections:
                raise ValueError("Document yielded 0 readable sections or is completely blank.")

            # 2. Extract full text representation
            full_text = parser.extract_full_text(sections)

            # 3. Extract claims from actual document content
            claims = self.claim_extractor.extract_claims(sections, document_id)
            
            # Attach creation timestamp to claims
            now_iso = datetime.now(timezone.utc).isoformat()
            for c in claims:
                c["created_at"] = now_iso

            # 4. Persist sections and claims in SQLite
            save_sections(sections)
            save_claims(claims)

            # 5. Mark document as Completed
            update_document_results(
                doc_id=document_id,
                extracted_text=full_text,
                section_count=len(sections),
                claim_count=len(claims),
                status="Completed",
                error=None
            )

            logger.info("Successfully processed doc %s: %d sections, %d claims", document_id, len(sections), len(claims))

            return {
                "success": True,
                "document_id": document_id,
                "status": "Completed",
                "section_count": len(sections),
                "claim_count": len(claims),
                "message": f"Successfully processed {doc['filename']}: extracted {len(sections)} sections and {len(claims)} claims."
            }

        except Exception as e:
            err_msg = str(e)
            logger.error("Processing failed for doc %s: %s", document_id, err_msg, exc_info=True)
            # Mark document as Failed in database
            update_document_status(document_id, "Failed", error=err_msg)
            return {
                "success": False,
                "document_id": document_id,
                "status": "Failed",
                "section_count": 0,
                "claim_count": 0,
                "error": err_msg,
                "message": f"Failed to process {doc['filename']}: {err_msg}"
            }

    def process_all_pending(self) -> Dict[str, Any]:
        """
        Processes all documents currently in 'Uploaded' or 'Failed' status.
        """
        from backend.database import get_all_documents
        all_docs = get_all_documents()
        pending = [d for d in all_docs if d["status"] in ("Uploaded", "Failed")]
        
        results = []
        for d in pending:
            res = self.process_document(d["id"])
            results.append(res)

        return {
            "total_processed": len(results),
            "results": results
        }
