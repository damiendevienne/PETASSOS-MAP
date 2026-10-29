export class ApiError extends Error {
  constructor(message, status, detail = '') {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detail = detail;
  }
}

async function request(path, options = {}) {
  const { body, headers = {}, ...fetchOptions } = options;
  const requestHeaders = { ...headers };
  let requestBody = body;
  if (body !== undefined && !(body instanceof FormData)) {
    requestHeaders['Content-Type'] ??= 'application/json';
    requestBody = JSON.stringify(body);
  }
  const response = await fetch(path, { ...fetchOptions, headers: requestHeaders, body: requestBody });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = typeof payload?.detail === 'string' ? payload.detail : '';
    throw new ApiError(detail || `HTTP ${response.status}`, response.status, detail);
  }
  return payload;
}

export const api = {
  get: (path, options = {}) => request(path, { ...options, method: 'GET' }),
  post: (path, body, options = {}) => request(path, { ...options, method: 'POST', body }),
  put: (path, body, options = {}) => request(path, { ...options, method: 'PUT', body }),
  patch: (path, body, options = {}) => request(path, { ...options, method: 'PATCH', body }),
  delete: (path, options = {}) => request(path, { ...options, method: 'DELETE' }),
};
