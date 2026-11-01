// The ONLY place that talks to the backend. Every page uses api.get/post/put/del/patch.
// Responsibilities: base URL, JWT header, JSON parsing, uniform error objects, 401 handling.
const BASE = (import.meta.env.VITE_API_URL || '/api/v1').replace(/\/$/, '');
const TOKEN_KEY = 'sias_token';

// sessionStorage: cleared when the tab closes. Trade-off (see README): any XSS could read it,
// which is why the app renders React-escaped text only and never uses dangerouslySetInnerHTML.
export const tokenStore = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (t) => sessionStorage.setItem(TOKEN_KEY, t),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

export class ApiError extends Error {
  constructor(message, status, details) { super(message); this.status = status; this.details = details; }
}

function qs(params = {}) {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) p.append(k, v); });
  const s = p.toString();
  return s ? `?${s}` : '';
}

async function request(method, path, { params, body, raw } = {}) {
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${BASE}${path}${qs(params)}`, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined });
  } catch {
    throw new ApiError('Cannot reach the server. Check your connection and that the backend is running.', 0);
  }
  if (raw && res.ok) return res;

  let json = null;
  try { json = await res.json(); } catch { /* non-JSON body */ }
  if (!res.ok || !json?.success) {
    if (res.status === 401 && token) { tokenStore.clear(); window.dispatchEvent(new Event('sias:unauthorized')); }
    throw new ApiError(json?.error?.message || `Request failed (${res.status})`, res.status, json?.error?.details);
  }
  return json;   // { success, data, meta }
}

export const api = {
  get: (path, params) => request('GET', path, { params }),
  post: (path, body) => request('POST', path, { body: body ?? {} }),
  put: (path, body) => request('PUT', path, { body }),
  patch: (path, body) => request('PATCH', path, { body: body ?? {} }),
  del: (path) => request('DELETE', path),
  // Downloads a CSV with the auth header and saves it through a temporary link.
  async download(path, params) {
    const res = await request('GET', path, { params: { ...params, format: 'csv' }, raw: true });
    const blob = await res.blob();
    const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') || '')?.[1] || 'report.csv';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
    return name;
  },
};
