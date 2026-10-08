import sqlite3
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import List, Optional, Dict, Any
from backend.config import DATABASE_PATH

def get_db_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    # Enable WAL mode and foreign keys for SQLite performance and reliability
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA foreign_keys=ON;")
    return conn

def init_db():
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_db_connection() as conn:
        cursor = conn.cursor()
        
        # Documents table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS documents (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                file_path TEXT NOT NULL,
                file_hash TEXT,
                type TEXT NOT NULL,
                size INTEGER NOT NULL,
                upload_time TEXT NOT NULL,
                status TEXT NOT NULL CHECK(status IN ('Uploaded', 'Processing', 'Completed', 'Failed')),
                extracted_text TEXT,
                section_count INTEGER DEFAULT 0,
                claim_count INTEGER DEFAULT 0,
                error TEXT
            );
        """)

        # Document sections table (stores page/paragraph/sheet level text chunks)
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS document_sections (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                source TEXT NOT NULL,
                location TEXT NOT NULL,
                text TEXT NOT NULL,
                FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
            );
        """)

        # Claims table
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS claims (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                claim TEXT NOT NULL,
                claim_type TEXT NOT NULL,
                source TEXT NOT NULL,
                confidence REAL NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
            );
        """)

        # Indexes for fast lookup
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_claims_doc_id ON claims(document_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_sections_doc_id ON document_sections(document_id);")
        cursor.execute("CREATE INDEX IF NOT EXISTS idx_docs_upload_time ON documents(upload_time);")

        conn.commit()

# --- Database Helper Functions ---

def insert_document(doc: Dict[str, Any]):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO documents (
                id, filename, file_path, file_hash, type, size, upload_time, status,
                extracted_text, section_count, claim_count, error
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            doc["id"],
            doc["filename"],
            doc.get("file_path", ""),
            doc.get("file_hash", ""),
            doc["type"],
            doc["size"],
            doc["upload_time"],
            doc["status"],
            doc.get("extracted_text", ""),
            doc.get("section_count", 0),
            doc.get("claim_count", 0),
            doc.get("error", None)
        ))
        conn.commit()

def get_all_documents() -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM documents ORDER BY upload_time DESC")
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

def get_document_by_id(doc_id: str) -> Optional[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM documents WHERE id = ?", (doc_id,))
        row = cursor.fetchone()
        return dict(row) if row else None

def get_document_by_hash(file_hash: str) -> Optional[Dict[str, Any]]:
    if not file_hash:
        return None
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM documents WHERE file_hash = ?", (file_hash,))
        row = cursor.fetchone()
        return dict(row) if row else None

def update_document_status(doc_id: str, status: str, error: Optional[str] = None):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE documents 
            SET status = ?, error = ?
            WHERE id = ?
        """, (status, error, doc_id))
        conn.commit()

def update_document_results(doc_id: str, extracted_text: str, section_count: int, claim_count: int, status: str = "Completed", error: Optional[str] = None):
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE documents 
            SET extracted_text = ?, section_count = ?, claim_count = ?, status = ?, error = ?
            WHERE id = ?
        """, (extracted_text, section_count, claim_count, status, error, doc_id))
        conn.commit()

def save_sections(sections: List[Dict[str, Any]]):
    if not sections:
        return
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.executemany("""
            INSERT OR REPLACE INTO document_sections (id, document_id, source, location, text)
            VALUES (?, ?, ?, ?, ?)
        """, [
            (s["id"], s["document_id"], s["source"], s["location"], s["text"])
            for s in sections
        ])
        conn.commit()

def get_sections_by_document(doc_id: str) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM document_sections WHERE document_id = ?", (doc_id,))
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

def save_claims(claims: List[Dict[str, Any]]):
    if not claims:
        return
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.executemany("""
            INSERT OR REPLACE INTO claims (id, document_id, claim, claim_type, source, confidence, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, [
            (c["id"], c["document_id"], c["claim"], c["claim_type"], c["source"], c["confidence"], c["created_at"])
            for c in claims
        ])
        conn.commit()

def get_claims_by_document(doc_id: str) -> List[Dict[str, Any]]:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("SELECT * FROM claims WHERE document_id = ? ORDER BY confidence DESC, created_at ASC", (doc_id,))
        rows = cursor.fetchall()
        return [dict(row) for row in rows]

def delete_document(doc_id: str) -> bool:
    with get_db_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM claims WHERE document_id = ?", (doc_id,))
        cursor.execute("DELETE FROM document_sections WHERE document_id = ?", (doc_id,))
        cursor.execute("DELETE FROM documents WHERE id = ?", (doc_id,))
        conn.commit()
        return cursor.rowcount > 0
