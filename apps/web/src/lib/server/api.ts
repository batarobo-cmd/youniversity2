import { redirect } from '@sveltejs/kit';
import type { User } from '@youniversity2/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export function requireAuthToken(token: string | null | undefined): asserts token is string {
  if (!token) redirect(303, '/');
}

export function requireAdmin(user: User | null | undefined) {
  if (user?.role !== 'admin' && user?.role !== 'instructor') redirect(303, '/dashboard');
}

export function requirePlatformAdmin(user: User | null | undefined) {
  if (user?.role !== 'admin') redirect(303, '/dashboard');
}

export async function serverApiFetch(
  fetch: typeof globalThis.fetch,
  token: string,
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${API_URL}${path}`, { ...init, headers });
}

export async function serverApiJson<T>(
  fetch: typeof globalThis.fetch,
  token: string,
  path: string,
  init?: RequestInit,
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await serverApiFetch(fetch, token, path, init);
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      return {
        data: null,
        error: (err as { error?: string }).error ?? `Chyba ${res.status}`,
      };
    }
    return { data: (await res.json()) as T, error: null };
  } catch {
    return { data: null, error: 'Nepodarilo sa spojiť so serverom.' };
  }
}
