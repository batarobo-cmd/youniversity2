import { fail, isActionFailure } from '@sveltejs/kit';
import type { Cookies } from '@sveltejs/kit';
import { serverApiJson } from '$lib/server/api';
import { runServerApiMutation } from '$lib/server/mutations';
import {
  actionAdminOrFail,
  actionPlatformAdminOrFail,
  actionUserOrFail,
  type ActionAuth,
} from '$lib/server/actions';

export type ApiAuthLevel = 'user' | 'admin' | 'platformAdmin';

async function resolveAuth(
  level: ApiAuthLevel,
  fetch: typeof globalThis.fetch,
  cookies: Cookies,
) {
  if (level === 'platformAdmin') return actionPlatformAdminOrFail(fetch, cookies);
  if (level === 'admin') return actionAdminOrFail(fetch, cookies);
  return actionUserOrFail(fetch, cookies);
}

export async function handleApiQuery(
  fetch: typeof globalThis.fetch,
  cookies: Cookies,
  request: Request,
  level: ApiAuthLevel = 'user',
) {
  const auth = await resolveAuth(level, fetch, cookies);
  if (isActionFailure(auth)) return auth;

  const path = (await request.formData()).get('path')?.toString();
  if (!path?.startsWith('/api/')) return fail(400, { error: 'Neplatná cesta API.' });

  const result = await serverApiJson<unknown>(fetch, (auth as ActionAuth).token, path);
  if (result.error) return fail(503, { error: result.error });
  return { success: true as const, data: result.data };
}

export async function handleApiMutation(
  fetch: typeof globalThis.fetch,
  cookies: Cookies,
  request: Request,
  level: ApiAuthLevel = 'user',
) {
  const auth = await resolveAuth(level, fetch, cookies);
  if (isActionFailure(auth)) return auth;

  const fd = await request.formData();
  const path = fd.get('path')?.toString();
  const method = fd.get('method')?.toString()?.toUpperCase() ?? 'POST';
  const body = fd.get('body')?.toString();

  if (!path?.startsWith('/api/')) return fail(400, { error: 'Neplatná cesta API.' });

  const init: RequestInit = { method };
  if (body && method !== 'GET' && method !== 'HEAD') {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = body;
  }

  const mutation = await runServerApiMutation(fetch, (auth as ActionAuth).token, path, init);
  if (isActionFailure(mutation)) return mutation;
  return { success: true as const };
}
