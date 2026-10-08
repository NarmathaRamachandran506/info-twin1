from abc import ABC, abstractmethod
from pathlib import Path
from typing import List, Dict, Any

class BaseParser(ABC):
    """
    Abstract Base Class for document parsers.
    Standardizes ingestion across PDF, DOCX, XLSX formats.
    """

    @abstractmethod
    def parse(self, file_path: Path, document_id: str) -> List[Dict[str, Any]]:
        """
        Parses a document file and converts extracted content into the common structure:
        [
            {
                "id": "...",
                "document_id": "...",
                "source": "page" | "paragraph" | "sheet",
                "location": "...",
                "text": "..."
            }
        ]
        """
        pass

    def extract_full_text(self, sections: List[Dict[str, Any]]) -> str:
        """Combines all section text into a unified full text representation."""
        return "\n\n".join([f"[{s['location']}]\n{s['text']}" for s in sections if s.get("text")])
