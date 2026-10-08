import pytest
from backend.services.claim_extractor import ClaimExtractorService, CLAIM_TYPES

def test_claim_extractor_classification():
    extractor = ClaimExtractorService()

    sections = [
        {
            "id": "sec-1",
            "document_id": "doc-1",
            "source": "page",
            "location": "Page 1",
            "text": "The final submission deadline is strictly no later than November 15, 2025. All production infrastructure must enforce multi-factor hardware authentication by March 31, 2025."
        },
        {
            "id": "sec-2",
            "document_id": "doc-1",
            "source": "page",
            "location": "Page 2",
            "text": "Total annual revenue reached $142.5 million in FY 2024, representing an increase of 28.4%. The company is headquartered in Zurich, Switzerland with major operations in New York."
        }
    ]

    claims = extractor.extract_claims(sections, "doc-1")
    assert len(claims) >= 3, f"Expected at least 3 claims, got {len(claims)}"

    claim_types = [c["claim_type"] for c in claims]

    # Verify claim types
    for c in claims:
        assert c["claim_type"] in CLAIM_TYPES
        assert c["confidence"] >= 0.5
        assert c["document_id"] == "doc-1"
        assert c["source"] in ["Page 1", "Page 2"]
        assert len(c["claim"]) > 10

    # Ensure Deadline, Requirement, Numeric/Fact were recognized
    assert any(t in ["Deadline", "Date"] for t in claim_types)
    assert any(t in ["Requirement", "Deadline"] for t in claim_types)
    assert any(t in ["Numeric", "Fact"] for t in claim_types)

def test_empty_sections():
    extractor = ClaimExtractorService()
    claims = extractor.extract_claims([], "doc-empty")
    assert claims == []
