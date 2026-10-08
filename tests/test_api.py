import pytest
from pathlib import Path
from fastapi.testclient import TestClient
from backend.main import app
from backend.database import init_db

SAMPLE_DIR = Path(__file__).resolve().parent.parent / "sample_files"
client = TestClient(app)

@pytest.fixture(autouse=True)
def setup_db():
    init_db()

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert "PDF" in data["supported_formats"]

def test_full_document_pipeline_flow():
    pdf_path = SAMPLE_DIR / "enterprise_ai_audit_report.pdf"
    assert pdf_path.exists(), "Sample PDF must exist for API test"

    # 1. Upload Document
    with open(pdf_path, "rb") as f:
        upload_resp = client.post(
            "/api/documents/upload",
            files={"files": (pdf_path.name, f, "application/pdf")}
        )
    assert upload_resp.status_code == 200
    upload_data = upload_resp.json()
    assert upload_data["success"] is True
    doc_id = upload_data["documents"][0]["id"]
    assert doc_id is not None

    # 2. Verify in List
    list_resp = client.get("/api/documents")
    assert list_resp.status_code == 200
    docs = list_resp.json()["documents"]
    doc_entry = next((d for d in docs if d["id"] == doc_id), None)
    assert doc_entry is not None
    assert doc_entry["status"] in ("Uploaded", "Completed")

    # 3. Process Document
    process_resp = client.post(f"/api/documents/{doc_id}/process")
    assert process_resp.status_code == 200
    proc_data = process_resp.json()
    assert proc_data["success"] is True
    assert proc_data["status"] == "Completed"
    assert proc_data["section_count"] >= 2
    assert proc_data["claim_count"] >= 3

    # 4. Get Document Details
    detail_resp = client.get(f"/api/documents/{doc_id}")
    assert detail_resp.status_code == 200
    detail = detail_resp.json()
    assert detail["status"] == "Completed"
    assert detail["claim_count"] >= 3

    # 5. Get Extracted Claims
    claims_resp = client.get(f"/api/documents/{doc_id}/claims")
    assert claims_resp.status_code == 200
    claims_data = claims_resp.json()
    assert claims_data["total_claims"] >= 3
    for claim in claims_data["claims"]:
        assert claim["claim_type"] in [
            "Fact", "Numeric", "Date", "Deadline", "Requirement", "Entity", "Location", "Statement", "Unknown"
        ]
        assert claim["source"].startswith("Page")
        assert 0.0 <= claim["confidence"] <= 1.0

    # 6. Get Document Sections (Phase 2 common structure)
    sections_resp = client.get(f"/api/documents/{doc_id}/sections")
    assert sections_resp.status_code == 200
    sec_data = sections_resp.json()
    assert sec_data["total_sections"] >= 2
    for s in sec_data["sections"]:
        assert s["source"] == "page"
        assert s["location"].startswith("Page")

    # 7. Delete Document
    del_resp = client.delete(f"/api/documents/{doc_id}")
    assert del_resp.status_code == 200
    assert del_resp.json()["success"] is True
