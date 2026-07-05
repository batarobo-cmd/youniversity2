import { redirect } from '@sveltejs/kit';
import { SESSION_COOKIE } from '$lib/session';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';

export async function POST({ cookies, fetch }) {
  const sessionId = cookies.get(SESSION_COOKIE);
  if (sessionId) {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionId}` },
      });
    } catch {
      /* API nedostupné */
    }
  }
  cookies.delete(SESSION_COOKIE, { path: '/' });
  cookies.delete('yo2_token', { path: '/' });
  redirect(303, '/');
}

/** Záložný GET — funguje aj pri priamom odkaze */
export async function GET({ cookies, fetch }) {
  const sessionId = cookies.get(SESSION_COOKIE);
  if (sessionId) {
    try {
      await fetch(`${API_URL}/api/auth/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${sessionId}` },
      });
    } catch {
      /* API nedostupné */
    }
  }
  cookies.delete(SESSION_COOKIE, { path: '/' });
  cookies.delete('yo2_token', { path: '/' });
  redirect(303, '/');
}
