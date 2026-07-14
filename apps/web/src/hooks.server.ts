import type { Handle } from '@sveltejs/kit';
import { applyWebSecurityHeaders } from '$lib/server/security-headers';

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  const forwardedProto = event.request.headers.get('x-forwarded-proto');
  const isHttps = event.url.protocol === 'https:' || forwardedProto === 'https';
  applyWebSecurityHeaders(response.headers, { hsts: isHttps });

  const contentType = response.headers.get('content-type') ?? '';
  if (event.request.method === 'GET' && contentType.includes('text/html')) {
    response.headers.set('Cache-Control', 'no-store');
  }

  return response;
};
