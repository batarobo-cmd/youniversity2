import { redirect } from '@sveltejs/kit';
import type { User } from '@youniversity2/shared';
import { STUDENT_VIEW_COOKIE, STUDENT_VIEW_HEADER, isStaffRole, isPlatformAdminRole } from '@youniversity2/shared';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export function readStudentViewCookie(cookies: { get: (name: string) => string | undefined }): boolean {
  return cookies.get(STUDENT_VIEW_COOKIE) === '1';
}

export function studentViewApiHeaders(
  cookies: { get: (name: string) => string | undefined },
): Record<string, string> {
  return readStudentViewCookie(cookies) ? { [STUDENT_VIEW_HEADER]: '1' } : {};
}

export function requireAuthToken(token: string | null | undefined): asserts token is string {
  if (!token) redirect(303, '/');
}

export function requireAdmin(user: User | null | undefined) {
  if (!isStaffRole(user?.role)) redirect(303, '/dashboard');
}

export function requirePlatformAdmin(user: User | null | undefined) {
  if (!isPlatformAdminRole(user?.role)) redirect(303, '/dashboard');
}

export async function serverApiFetch(
  fetch: typeof globalThis.fetch,
  token: string,
  path: string,
  init: RequestInit = {},
  extraHeaders: Record<string, string> = {},
): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  for (const [key, value] of Object.entries(extraHeaders)) {
    headers.set(key, value);
  }
  return fetch(`${API_URL}${path}`, { ...init, headers });
}

export async function serverApiJson<T>(
  fetch: typeof globalThis.fetch,
  token: string,
  path: string,
  init?: RequestInit,
  extraHeaders: Record<string, string> = {},
): Promise<{ data: T | null; error: string | null }> {
  try {
    const res = await serverApiFetch(fetch, token, path, init, extraHeaders);
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
