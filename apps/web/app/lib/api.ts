export const API =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  return fetch(input, { ...init, credentials: 'include' });
}
