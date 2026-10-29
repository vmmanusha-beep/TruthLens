const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api')
  .replace(/\/+$/, '');

async function request(path, { body, signal } = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Accept: 'application/json' },
    body,
    signal,
  });
  const data = await response.json().catch(() => null);

  if (!response.ok) {
    const error = new Error(data?.error || `Request failed with HTTP ${response.status}.`);
    error.statusCode = response.status;
    error.code = data?.code;
    error.data = data;
    throw error;
  }

  return data;
}

export function getHealth({ signal } = {}) {
  return request('/health', { signal });
}

export function analyzeImage(file, { signal } = {}) {
  const body = new FormData();
  body.append('image', file, file.name);

  return request('/analysis', {
    body,
    signal,
  });
}