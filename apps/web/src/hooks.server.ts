import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
  const response = await resolve(event);

  const contentType = response.headers.get('content-type') ?? '';
  if (event.request.method === 'GET' && contentType.includes('text/html')) {
    response.headers.set('Cache-Control', 'no-store');
  }

  return response;
};
