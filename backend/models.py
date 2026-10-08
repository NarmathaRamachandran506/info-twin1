from typing import List, Optional
from pydantic import BaseModel, Field

class SectionModel(BaseModel):
    id: Optional[str] = None
    document_id: str
    source: str  # "page" | "paragraph" | "sheet"
    location: str  # e.g., "Page 1", "Paragraph 4", "Sheet: Sales (Row 2)"
    text: str

class ClaimModel(BaseModel):
    id: str
    document_id: str
    claim: str
    claim_type: str = Field(
        ...,
        description="Fact, Numeric, Date, Deadline, Requirement, Entity, Location, Statement, Unknown"
    )
    source: str
    confidence: float
    created_at: Optional[str] = None

class DocumentSummary(BaseModel):
    id: str
    filename: str
    type: str
    size: int
    upload_time: str
    status: str
    section_count: int = 0
    claim_count: int = 0
    error: Optional[str] = None

class DocumentDetail(DocumentSummary):
    file_path: Optional[str] = None
    extracted_text: Optional[str] = None

class DocumentListResponse(BaseModel):
    documents: List[DocumentSummary]
    total: int

class ClaimsResponse(BaseModel):
    document_id: str
    filename: str
    claims: List[ClaimModel]
    total_claims: int

class SectionsResponse(BaseModel):
    document_id: str
    sections: List[SectionModel]
    total_sections: int

class ProcessResponse(BaseModel):
    success: bool
    document_id: str
    status: str
    section_count: int
    claim_count: int
    message: str
    error: Optional[str] = None
