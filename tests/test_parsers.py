import pytest
from pathlib import Path
from backend.parsers.factory import get_parser, ParserFactory
from backend.parsers.pdf_parser import PDFParser
from backend.parsers.docx_parser import DOCXParser
from backend.parsers.xlsx_parser import XLSXParser

SAMPLE_DIR = Path(__file__).resolve().parent.parent / "sample_files"

def test_parser_factory():
    assert isinstance(get_parser("pdf"), PDFParser)
    assert isinstance(get_parser("docx"), DOCXParser)
    assert isinstance(get_parser("xlsx"), XLSXParser)
    assert isinstance(get_parser(".PDF"), PDFParser)

    with pytest.raises(ValueError):
        get_parser("unknown_format")

def test_pdf_parser():
    pdf_path = SAMPLE_DIR / "enterprise_ai_audit_report.pdf"
    assert pdf_path.exists(), "Sample PDF not found"

    parser = PDFParser()
    sections = parser.parse(pdf_path, "doc-test-pdf")

    assert len(sections) >= 2, f"Expected at least 2 pages/sections, got {len(sections)}"
    for s in sections:
        assert s["document_id"] == "doc-test-pdf"
        assert s["source"] == "page"
        assert "Page" in s["location"]
        assert len(s["text"]) > 20

    full_text = parser.extract_full_text(sections)
    assert "NovaTech" in full_text
    assert "Revenue" in full_text or "revenue" in full_text

def test_docx_parser():
    docx_path = SAMPLE_DIR / "system_architecture_requirements.docx"
    assert docx_path.exists(), "Sample DOCX not found"

    parser = DOCXParser()
    sections = parser.parse(docx_path, "doc-test-docx")

    assert len(sections) >= 3, f"Expected multiple paragraphs/table rows, got {len(sections)}"
    paragraph_sections = [s for s in sections if "Paragraph" in s["location"]]
    table_sections = [s for s in sections if "Table" in s["location"]]

    assert len(paragraph_sections) > 0
    assert len(table_sections) > 0

    full_text = parser.extract_full_text(sections)
    assert "Elena Rostova" in full_text or "Architectural" in full_text
    assert "Milestone Phase" in full_text or "Ingestion Engine" in full_text

def test_xlsx_parser():
    xlsx_path = SAMPLE_DIR / "global_operations_metrics.xlsx"
    assert xlsx_path.exists(), "Sample XLSX not found"

    parser = XLSXParser()
    sections = parser.parse(xlsx_path, "doc-test-xlsx")

    assert len(sections) >= 4, f"Expected multiple sheet rows, got {len(sections)}"
    for s in sections:
        assert s["document_id"] == "doc-test-xlsx"
        assert s["source"] == "sheet"
        assert "Sheet" in s["location"]
        assert ":" in s["text"]

    full_text = parser.extract_full_text(sections)
    assert "Customer Acquisition" in full_text or "Performance_KPIs" in full_text
