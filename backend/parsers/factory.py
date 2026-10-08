from typing import Dict, Type
from .base import BaseParser
from .pdf_parser import PDFParser
from .docx_parser import DOCXParser
from .xlsx_parser import XLSXParser

class ParserFactory:
    """
    Factory to retrieve appropriate document parser by file extension or MIME type.
    """
    _registry: Dict[str, Type[BaseParser]] = {
        "pdf": PDFParser,
        "docx": DOCXParser,
        "xlsx": XLSXParser,
        "application/pdf": PDFParser,
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document": DOCXParser,
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": XLSXParser,
    }

    @classmethod
    def get_parser(cls, file_type: str) -> BaseParser:
        normalized = file_type.lower().strip().lstrip(".")
        parser_cls = cls._registry.get(normalized)
        if not parser_cls:
            supported = ", ".join(["PDF", "DOCX", "XLSX"])
            raise ValueError(f"Unsupported document format: '{file_type}'. Supported formats are: {supported}")
        return parser_cls()

def get_parser(file_type: str) -> BaseParser:
    return ParserFactory.get_parser(file_type)
