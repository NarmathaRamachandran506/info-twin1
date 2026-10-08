/**
 * Centralized API service interacting with the existing FastAPI backend.
 * Strict contract adherence: does not alter backend routes.
 */

const BASE_URL = ''; // Relative path leverages Vite dev proxy and FastAPI root

export async function fetchHealth() {
  const res = await fetch(`${BASE_URL}/api/health`);
  if (!res.ok) throw new Error('Health check failed');
  return res.json();
}

export async function fetchDocuments() {
  const res = await fetch(`${BASE_URL}/api/documents`);
  if (!res.ok) throw new Error('Failed to retrieve documents');
  return res.json();
}

export async function fetchDocumentById(id) {
  const res = await fetch(`${BASE_URL}/api/documents/${id}`);
  if (!res.ok) throw new Error(`Failed to retrieve document ${id}`);
  return res.json();
}

export async function uploadDocuments(fileList) {
  const formData = new FormData();
  for (let i = 0; i < fileList.length; i++) {
    formData.append('files', fileList[i]);
  }

  const res = await fetch(`${BASE_URL}/api/documents/upload`, {
    method: 'POST',
    body: formData,
  });

  const data = await res.json();
  if (!res.ok) {
    const errorMsg = data.detail?.errors
      ? data.detail.errors.join('; ')
      : (data.detail || 'Upload failed');
    throw new Error(errorMsg);
  }
  return data;
}

export async function processDocument(id) {
  const res = await fetch(`${BASE_URL}/api/documents/${id}/process`, {
    method: 'POST',
  });
  const data = await res.json();
  if (!res.ok || !data.success) {
    throw new Error(data.error || data.message || `Failed to process document ${id}`);
  }
  return data;
}

export async function processAllDocuments() {
  const res = await fetch(`${BASE_URL}/api/documents/process-all`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Batch processing failed');
  return res.json();
}

export async function fetchDocumentClaims(id, { claimType = null, minConfidence = null } = {}) {
  const params = new URLSearchParams();
  if (claimType && claimType !== 'All') params.append('claim_type', claimType);
  if (minConfidence !== null && minConfidence !== undefined) {
    params.append('min_confidence', minConfidence);
  }

  const queryStr = params.toString() ? `?${params.toString()}` : '';
  const res = await fetch(`${BASE_URL}/api/documents/${id}/claims${queryStr}`);
  if (!res.ok) throw new Error(`Failed to retrieve claims for document ${id}`);
  return res.json();
}

export async function fetchDocumentSections(id) {
  const res = await fetch(`${BASE_URL}/api/documents/${id}/sections`);
  if (!res.ok) throw new Error(`Failed to retrieve sections for document ${id}`);
  return res.json();
}

export async function deleteDocument(id) {
  const res = await fetch(`${BASE_URL}/api/documents/${id}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Failed to delete document ${id}`);
  return res.json();
}

export async function loadSampleBenchmarkDocuments() {
  const res = await fetch(`${BASE_URL}/api/documents/load-samples`, {
    method: 'POST',
  });
  if (!res.ok) throw new Error('Failed to load sample benchmark documents');
  return res.json();
}
