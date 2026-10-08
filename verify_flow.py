"""
End-to-end flow verification script:
Upload PDF/DOCX/XLSX -> Extract content -> Generate real claims -> Store in SQLite -> Display results -> Refresh and verify persistence.
"""
import sys
from pathlib import Path
from fastapi.testclient import TestClient

# Ensure root in sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent))

from backend.main import app
from backend.database import get_db_connection, init_db

SAMPLE_DIR = Path(__file__).resolve().parent / "sample_files"

def run_verification():
    print("=" * 70)
    print("E2E PIPELINE & PERSISTENCE VERIFICATION")
    print("=" * 70)

    # 1. Initialize SQLite
    init_db()
    client = TestClient(app)

    # 2. Upload PDF, DOCX, XLSX
    files_to_test = [
        ("enterprise_ai_audit_report.pdf", "application/pdf"),
        ("system_architecture_requirements.docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        ("global_operations_metrics.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet")
    ]

    doc_ids = []

    print("\n[STEP 1] Uploading multi-format documents (PDF, DOCX, XLSX)...")
    for filename, mime in files_to_test:
        file_path = SAMPLE_DIR / filename
        assert file_path.exists(), f"File {file_path} must exist"

        with open(file_path, "rb") as f:
            resp = client.post(
                "/api/documents/upload",
                files={"files": (filename, f, mime)}
            )
        assert resp.status_code == 200, f"Upload failed for {filename}: {resp.text}"
        data = resp.json()
        doc_record = data["documents"][0]
        doc_id = doc_record["id"]
        doc_ids.append((doc_id, filename, doc_record["type"]))
        print(f"  + Uploaded: {filename} ({doc_record['type']}) -> ID: {doc_id} | Status: {doc_record['status']}")

    # 3. Process each document
    print("\n[STEP 2] Processing documents (PyMuPDF, python-docx, openpyxl + ClaimExtractor)...")
    for doc_id, filename, doc_type in doc_ids:
        proc_resp = client.post(f"/api/documents/{doc_id}/process")
        assert proc_resp.status_code == 200, f"Processing failed for {filename}: {proc_resp.text}"
        res = proc_resp.json()
        print(f"  + Processed: {filename} -> Status: {res['status']} | Sections: {res['section_count']} | Claims: {res['claim_count']}")
        assert res["status"] == "Completed"
        assert res["section_count"] > 0
        assert res["claim_count"] > 0

    # 4. Direct SQLite Verification
    print("\n[STEP 3] Direct SQLite Database Inspection...")
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # Verify documents table
        cursor.execute("SELECT id, filename, type, status, section_count, claim_count FROM documents")
        db_docs = cursor.fetchall()
        print(f"  + Total Documents in SQLite: {len(db_docs)}")
        for d in db_docs:
            print(f"    - {d['filename']} [{d['type']}]: {d['status']} (Sections: {d['section_count']}, Claims: {d['claim_count']})")
            assert d["status"] == "Completed"

        # Verify sections table
        cursor.execute("SELECT DISTINCT source FROM document_sections")
        sources = [row[0] for row in cursor.fetchall()]
        print(f"  + Common ingestion sources represented: {sources}")
        assert "page" in sources, "Expected 'page' source from PDF"
        assert "paragraph" in sources, "Expected 'paragraph' source from DOCX"
        assert "sheet" in sources, "Expected 'sheet' source from XLSX"

        # Verify claims table
        cursor.execute("SELECT claim_type, COUNT(*) as cnt FROM claims GROUP BY claim_type")
        claim_type_counts = cursor.fetchall()
        print("  + Extracted Claim Types Distribution:")
        for ct in claim_type_counts:
            print(f"    - {ct['claim_type']}: {ct['cnt']} claims")

    # 5. Simulated Reload & API Persistence Verification
    print("\n[STEP 4] Simulated Browser Page Reload & Re-fetch from SQLite...")
    list_resp = client.get("/api/documents")
    assert list_resp.status_code == 200
    listed_docs = list_resp.json()["documents"]
    assert len(listed_docs) >= 3

    for doc_id, filename, _ in doc_ids:
        claims_resp = client.get(f"/api/documents/{doc_id}/claims")
        assert claims_resp.status_code == 200
        claims_data = claims_resp.json()
        print(f"\n  [Sample Claims for {filename} ({claims_data['total_claims']} total)]:")
        for idx, c in enumerate(claims_data["claims"][:3], start=1):
            print(f"    {idx}. [{c['claim_type']}] ({c['source']}, Conf: {int(c['confidence']*100)}%) \"{c['claim']}\"")

    print("\n" + "=" * 70)
    print("ALL TESTS & PERSISTENCE VERIFIED SUCCESSFULLY!")
    print("=" * 70)

if __name__ == "__main__":
    run_verification()
