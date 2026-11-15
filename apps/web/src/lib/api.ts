const BASE = import.meta.env.VITE_API_URL || '/api';

const TOKEN_KEY = 'erp_token';
const LEGACY_TOKEN_KEY = 'gs_token';

export function token() {
  return localStorage.getItem(TOKEN_KEY) || localStorage.getItem(LEGACY_TOKEN_KEY) || '';
}
export function setToken(t: string) {
  if (t) {
    localStorage.setItem(TOKEN_KEY, t);
    localStorage.removeItem(LEGACY_TOKEN_KEY); // migrate sessions from the old key
  } else {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(LEGACY_TOKEN_KEY);
  }
}

async function req(path: string, opts: RequestInit = {}) {
  const res = await fetch(BASE + path, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(token() ? { Authorization: `Bearer ${token()}` } : {}), ...(opts.headers || {}) },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as any).message || (body as any).error || `HTTP ${res.status}`);
  return body;
}

export const api = {
  get: (p: string) => req(p),
  post: (p: string, b?: unknown) => req(p, { method: 'POST', body: JSON.stringify(b || {}) }),
  put: (p: string, b?: unknown) => req(p, { method: 'PUT', body: JSON.stringify(b || {}) }),
  patch: (p: string, b?: unknown) => req(p, { method: 'PATCH', body: JSON.stringify(b || {}) }),
  del: (p: string) => req(p, { method: 'DELETE' }),
  login: (email: string, password: string) => req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
};
export const inr = (n: number | string) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
