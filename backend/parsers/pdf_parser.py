import uuid
from pathlib import Path
from typing import List, Dict, Any
from .base import BaseParser

class PDFParser(BaseParser):
    """
    Extracts text and page numbers from PDF files using PyMuPDF (fitz).
    """

    def parse(self, file_path: Path, document_id: str) -> List[Dict[str, Any]]:
        import pymupdf as fitz

        sections: List[Dict[str, Any]] = []

        try:
            doc = fitz.open(str(file_path))
        except Exception as e:
            raise ValueError(f"Unable to read PDF file. It may be corrupted or unreadable: {str(e)}")

        try:
            if doc.is_encrypted:
                raise ValueError("PDF is encrypted or password-protected and cannot be processed.")

            page_count = len(doc)
            if page_count == 0:
                raise ValueError("PDF document contains no pages.")

            total_extracted_text = 0

            for page_index in range(page_count):
                page = doc[page_index]
                page_num = page_index + 1
                
                # Extract text blocks
                blocks = page.get_text("blocks")
                page_text_pieces = []

                if blocks:
                    for b in blocks:
                        # b is (x0, y0, x1, y1, text, block_no, block_type)
                        # block_type 0 is text
                        if len(b) >= 5 and (len(b) < 7 or b[6] == 0):
                            block_text = b[4].strip()
                            if block_text:
                                page_text_pieces.append(block_text)
                else:
                    raw_text = page.get_text("text").strip()
                    if raw_text:
                        page_text_pieces.append(raw_text)

                if page_text_pieces:
                    # If multiple blocks, create clean sections per paragraph block or unified page section
                    # Creating page-level chunk or logical blocks
                    combined_page_text = "\n\n".join(page_text_pieces)
                    total_extracted_text += len(combined_page_text)

                    # Store unified page entry
                    sections.append({
                        "id": str(uuid.uuid4()),
                        "document_id": document_id,
                        "source": "page",
                        "location": f"Page {page_num}",
                        "text": combined_page_text
                    })

            if total_extracted_text == 0:
                raise ValueError("PDF is valid but contains no extractable text (it may be a scanned image or empty).")

            return sections
        finally:
            doc.close()
