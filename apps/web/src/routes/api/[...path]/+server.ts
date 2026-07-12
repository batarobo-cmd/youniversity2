import { SESSION_COOKIE } from '$lib/session';
import type { RequestHandler } from './$types';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

const HOP_BY_HOP = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailers',
  'transfer-encoding',
  'upgrade',
]);

async function proxyToApi(
  request: Request,
  apiPath: string,
  search: string,
  sessionCookie: string | undefined,
): Promise<Response> {
  const headers = new Headers(request.headers);
  for (const name of HOP_BY_HOP) {
    headers.delete(name);
  }
  headers.delete('host');

  if (sessionCookie && !headers.has('authorization')) {
    headers.set('Authorization', `Bearer ${sessionCookie}`);
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  };

  if (request.method !== 'GET' && request.method !== 'HEAD') {
    init.body = await request.arrayBuffer();
  }

  const res = await fetch(`${API_URL}/api/${apiPath}${search}`, init);
  const responseHeaders = new Headers(res.headers);
  for (const name of HOP_BY_HOP) {
    responseHeaders.delete(name);
  }

  return new Response(res.body, {
    status: res.status,
    statusText: res.statusText,
    headers: responseHeaders,
  });
}

const handler: RequestHandler = async ({ params, request, url, cookies }) => {
  const apiPath = params.path ?? '';
  return proxyToApi(request, apiPath, url.search, cookies.get(SESSION_COOKIE));
};

export const GET = handler;
export const POST = handler;
export const PUT = handler;
export const PATCH = handler;
export const DELETE = handler;
export const OPTIONS = handler;
