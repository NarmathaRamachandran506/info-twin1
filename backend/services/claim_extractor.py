import re
import uuid
import json
import logging
from typing import List, Dict, Any, Optional
import requests
from backend.config import GEMINI_API_KEY, OPENAI_API_KEY, LLM_PROVIDER

logger = logging.getLogger(__name__)

# Allowed Claim Types
CLAIM_TYPES = [
    "Fact",
    "Numeric",
    "Date",
    "Deadline",
    "Requirement",
    "Entity",
    "Location",
    "Statement",
    "Unknown"
]

class ClaimExtractorService:
    """
    Service responsible for extracting verifiable claims from ingested document sections.
    Includes:
    - Rule-based deterministic NLP & pattern extraction (zero external dependencies, reliable fallback)
    - Optional LLM integration (Gemini / OpenAI) via environment variables
    - Graceful fallback on API failure or missing keys
    """

    def __init__(self):
        self.gemini_key = GEMINI_API_KEY
        self.openai_key = OPENAI_API_KEY
        self.provider = LLM_PROVIDER

    def extract_claims(self, sections: List[Dict[str, Any]], document_id: str) -> List[Dict[str, Any]]:
        """
        Main entry point for claim extraction.
        Tries LLM if configured; otherwise or on failure, uses reliable local extractor.
        """
        if not sections:
            return []

        # Attempt LLM extraction if key provided
        if self.gemini_key or (self.provider == "openai" and self.openai_key):
            try:
                llm_claims = self._extract_with_llm(sections, document_id)
                if llm_claims and len(llm_claims) > 0:
                    logger.info("Successfully extracted %d claims using AI API.", len(llm_claims))
                    return llm_claims
            except Exception as e:
                logger.warning("AI extraction failed or unavailable (%s). Falling back to rule-based extractor.", str(e))

        # Fallback to local rule-based extractor
        return self._extract_with_rules(sections, document_id)

    # -------------------------------------------------------------
    # Rule-Based Deterministic NLP Claim Extractor (Reliable Fallback)
    # -------------------------------------------------------------
    def _extract_with_rules(self, sections: List[Dict[str, Any]], document_id: str) -> List[Dict[str, Any]]:
        extracted_claims: List[Dict[str, Any]] = []
        seen_claims = set()

        # Regular Expressions for classification & extraction
        deadline_patterns = [
            r"\b(deadline|due date|no later than|expires on|submission deadline|cutoff date|due by|must be submitted by|prior to)\b",
            r"\b(by [A-Z][a-z]+ \d{1,2}(?:, \d{4})?)\b"
        ]
        requirement_patterns = [
            r"\b(must|shall|required to|needs to|is required|mandatory|compulsory|obligation|prerequisite|criteria)\b",
            r"\b(should ensure|is expected to|has to)\b"
        ]
        numeric_patterns = [
            r"(\$\s?[\d,]+(?:\.\d+)?|\b\d+(?:\.\d+)?%|\b[\d,]+(?:\.\d+)?\s*(?:million|billion|trillion|USD|EUR|GBP|kg|tons|units|users|growth|increase|decrease)\b)",
            r"\b(increased by \d+|decreased by \d+|total of \d+|sum of \d+|average of \d+)\b"
        ]
        date_patterns = [
            r"\b((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2}(?:,\s+\d{4})?)\b",
            r"\b(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})\b",
            r"\b(Q[1-4]\s*(?:20\d\d|\d\d))\b",
            r"\b((?:Fiscal Year|FY)\s*20\d\d)\b"
        ]
        location_patterns = [
            r"\b(located in|based in|headquartered in|facility in|office at|situated in|campus in|originating from)\s+([A-Z][a-zA-Z\s,]+)\b",
            r"\b(in (?:New York|California|London|Paris|Tokyo|Berlin|Singapore|India|USA|UK|Canada|Germany|France))\b"
        ]
        entity_patterns = [
            r"\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*\s+(?:Corp|Corporation|Inc|LLC|Ltd|Organization|Foundation|Agency|Department|Institute|University))\b",
            r"\b(Dr\.|Prof\.|Mr\.|Ms\.|CEO|CTO|CFO|Director|President)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\b"
        ]
        fact_patterns = [
            r"\b(consists of|comprises|is composed of|demonstrated that|proved to be|verified as|measured at|recorded as|established in)\b"
        ]

        for sec in sections:
            source_loc = sec.get("location", "Unknown Location")
            text = sec.get("text", "")

            # Split section text into distinct sentences / propositions
            raw_sentences = self._split_into_sentences(text)

            for sentence in raw_sentences:
                clean_s = sentence.strip()
                # Skip meaningless short or noise fragments
                if len(clean_s) < 15 or len(clean_s) > 400:
                    continue

                # Deduplicate identical sentences
                norm = clean_s.lower()
                if norm in seen_claims:
                    continue
                seen_claims.add(norm)

                # Classify sentence
                claim_type, confidence = self._classify_claim(
                    clean_s,
                    deadline_patterns,
                    requirement_patterns,
                    numeric_patterns,
                    date_patterns,
                    location_patterns,
                    entity_patterns,
                    fact_patterns
                )

                extracted_claims.append({
                    "id": str(uuid.uuid4()),
                    "document_id": document_id,
                    "claim": clean_s,
                    "claim_type": claim_type,
                    "source": source_loc,
                    "confidence": round(confidence, 2)
                })

        return extracted_claims

    def _split_into_sentences(self, text: str) -> List[str]:
        """Splits multiline or prose text into individual sentences and table records."""
        # Handle table rows with pipe delimiters
        if " | " in text:
            # Table row or spreadsheet record
            parts = [p.strip() for p in text.split(" | ") if p.strip()]
            # If line is a combined key-value record, also treat whole line as a claim
            sentences = [text] if len(text) < 250 else parts
            return sentences

        # Prose sentence splitting with regex
        lines = text.split("\n")
        sentences = []
        for line in lines:
            line = line.strip()
            if not line:
                continue
            # Split by period followed by space and capital letter or end of string
            raw_splits = re.split(r'(?<=[.!?])\s+(?=[A-Z0-9])', line)
            for s in raw_splits:
                if s.strip():
                    sentences.append(s.strip())
        return sentences

    def _classify_claim(
        self,
        sentence: str,
        deadline_patterns,
        requirement_patterns,
        numeric_patterns,
        date_patterns,
        location_patterns,
        entity_patterns,
        fact_patterns
    ) -> tuple[str, float]:
        """Classifies a claim into one of the designated types with a calibrated confidence score."""
        s = sentence.lower()

        # 1. Deadline check
        for pat in deadline_patterns:
            if re.search(pat, s, re.IGNORECASE):
                return "Deadline", 0.94

        # 2. Requirement check
        for pat in requirement_patterns:
            if re.search(pat, s, re.IGNORECASE):
                return "Requirement", 0.92

        # 3. Numeric check
        for pat in numeric_patterns:
            if re.search(pat, sentence):
                return "Numeric", 0.95

        # 4. Date check
        for pat in date_patterns:
            if re.search(pat, sentence, re.IGNORECASE):
                return "Date", 0.91

        # 5. Location check
        for pat in location_patterns:
            if re.search(pat, sentence, re.IGNORECASE):
                return "Location", 0.88

        # 6. Entity check
        for pat in entity_patterns:
            if re.search(pat, sentence):
                return "Entity", 0.89

        # 7. Fact check
        for pat in fact_patterns:
            if re.search(pat, s, re.IGNORECASE):
                return "Fact", 0.86

        # 8. Check general factual / declarative assertion
        if any(w in s for w in [" is ", " are ", " was ", " were ", " has ", " have ", " results ", " provides "]):
            return "Fact", 0.78

        # Default fallback
        if len(sentence.split()) >= 4:
            return "Statement", 0.70

        return "Unknown", 0.50

    # -------------------------------------------------------------
    # Optional LLM-based Claim Extraction (Gemini / OpenAI API)
    # -------------------------------------------------------------
    def _extract_with_llm(self, sections: List[Dict[str, Any]], document_id: str) -> List[Dict[str, Any]]:
        """
        Uses configured LLM API to extract claims from document text.
        Returns parsed claims list or raises exception to trigger fallback.
        """
        # Formulate condensed context from top sections
        sample_sections = sections[:15]
        combined_text = "\n\n".join([f"[{s.get('location')}]: {s.get('text')}" for s in sample_sections])

        prompt = f"""You are a precise claim extraction engine for Document Understanding.
Extract verifiable factual statements and propositions from the document content below.
For each claim, determine:
- claim: Exact or concisely normalized claim statement
- claim_type: Must be strictly one of [Fact, Numeric, Date, Deadline, Requirement, Entity, Location, Statement, Unknown]
- source: The section location where this claim appears (e.g. Page 1, Paragraph 2)
- confidence: Float between 0.0 and 1.0

DOCUMENT CONTENT:
{combined_text[:4000]}

Respond ONLY with a JSON array:
[
  {{
    "claim": "...",
    "claim_type": "...",
    "source": "...",
    "confidence": 0.95
  }}
]"""

        if self.gemini_key:
            return self._call_gemini_api(prompt, document_id)
        elif self.openai_key:
            return self._call_openai_api(prompt, document_id)
        
        return []

    def _call_gemini_api(self, prompt: str, document_id: str) -> List[Dict[str, Any]]:
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={self.gemini_key}"
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"}
        }
        res = requests.post(url, json=payload, timeout=12)
        if res.status_code != 200:
            raise RuntimeError(f"Gemini API returned status {res.status_code}: {res.text}")
        data = res.json()
        raw_text = data["candidates"][0]["content"]["parts"][0]["text"]
        claims_json = json.loads(raw_text)
        
        results = []
        for item in claims_json:
            ctype = item.get("claim_type", "Fact")
            if ctype not in CLAIM_TYPES:
                ctype = "Fact"
            results.append({
                "id": str(uuid.uuid4()),
                "document_id": document_id,
                "claim": item.get("claim", "").strip(),
                "claim_type": ctype,
                "source": item.get("source", "Document"),
                "confidence": float(item.get("confidence", 0.9))
            })
        return results

    def _call_openai_api(self, prompt: str, document_id: str) -> List[Dict[str, Any]]:
        url = "https://api.openai.com/v1/chat/completions"
        headers = {"Authorization": f"Bearer {self.openai_key}", "Content-Type": "application/json"}
        payload = {
            "model": "gpt-4o-mini",
            "messages": [{"role": "user", "content": prompt}],
            "temperature": 0.1,
            "response_format": {"type": "json_object"}
        }
        res = requests.post(url, json=payload, headers=headers, timeout=12)
        if res.status_code != 200:
            raise RuntimeError(f"OpenAI API returned status {res.status_code}: {res.text}")
        data = res.json()
        content = data["choices"][0]["message"]["content"]
        parsed = json.loads(content)
        claims_list = parsed if isinstance(parsed, list) else parsed.get("claims", [])
        
        results = []
        for item in claims_list:
            ctype = item.get("claim_type", "Fact")
            if ctype not in CLAIM_TYPES:
                ctype = "Fact"
            results.append({
                "id": str(uuid.uuid4()),
                "document_id": document_id,
                "claim": item.get("claim", "").strip(),
                "claim_type": ctype,
                "source": item.get("source", "Document"),
                "confidence": float(item.get("confidence", 0.9))
            })
        return results
