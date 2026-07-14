import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { SESSION_COOKIE } from '$lib/session';

const API_URL = process.env.API_URL ?? 'http://localhost:3001';
const SESSION_MAX_AGE = 60 * 60;
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true';

const defaultAuthConfig = {
  manualLoginEnabled: true,
  manualRegistrationEnabled: true,
  turnstileSiteKey: null as string | null,
  oauth: {
    google: { enabled: false },
    microsoft: { enabled: false },
  },
};

export const load: PageServerLoad = async () => {
  try {
    const res = await fetch(`${API_URL}/api/auth/config`);
    if (res.ok) {
      return { authConfig: await res.json() };
    }
  } catch {
    // API unavailable during load — fall back to safe defaults
  }
  return { authConfig: defaultAuthConfig };
};

function setSessionCookie(cookies: import('@sveltejs/kit').Cookies, sessionId: string) {
  cookies.set(SESSION_COOKIE, sessionId, {
    path: '/',
    maxAge: SESSION_MAX_AGE,
    httpOnly: true,
    secure: COOKIE_SECURE,
    sameSite: 'lax',
  });
  cookies.delete('yo2_token', { path: '/', secure: COOKIE_SECURE, sameSite: 'lax' });
}

export const actions = {
  login: async ({ request, cookies }) => {
    const form = await request.formData();
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');

    if (!email || !password) {
      return fail(400, { error: 'Vyplňte e-mail a heslo', email });
    }

    let res: Response;
    try {
      res = await fetch(`${API_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
    } catch {
      return fail(503, {
        error: 'Nepodarilo sa spojiť so serverom. Spustite API (bun run dev) a Docker.',
        email,
      });
    }

    const body = await res.json().catch(() => ({ error: 'Prihlásenie zlyhalo' }));

    if (!res.ok) {
      const bodyCode = (body as { code?: string }).code;
      return fail(res.status, {
        errorCode: bodyCode,
        error: (body as { error?: string }).error ?? 'Prihlásenie zlyhalo',
        email,
      });
    }

    const { sessionId } = body as { sessionId: string };
    setSessionCookie(cookies, sessionId);
    redirect(303, '/dashboard');
  },

  register: async ({ request, cookies }) => {
    const form = await request.formData();
    const email = String(form.get('email') ?? '').trim();
    const password = String(form.get('password') ?? '');
    const givenName = String(form.get('givenName') ?? '').trim();
    const familyName = String(form.get('familyName') ?? '').trim();
    const turnstileToken = String(
      form.get('cf-turnstile-response') ?? form.get('turnstileToken') ?? '',
    ).trim();
    const companyWebsite = String(form.get('companyWebsite') ?? '').trim();

    if (!email || !password || !givenName || !familyName) {
      return fail(400, { error: 'Vyplňte všetky polia' });
    }

    if (companyWebsite) {
      return fail(400, { error: 'Registrácia zlyhala' });
    }

    let res: Response;
    try {
      res = await fetch(`${API_URL}/api/auth/register`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Forwarded-For': request.headers.get('x-forwarded-for') ?? '',
          'X-Real-IP': request.headers.get('x-real-ip') ?? '',
        },
        body: JSON.stringify({
          email,
          password,
          givenName,
          familyName,
          preferredLocale: 'sk',
          turnstileToken: turnstileToken || undefined,
          companyWebsite: companyWebsite || undefined,
        }),
      });
    } catch {
      return fail(503, { error: 'Nepodarilo sa spojiť so serverom.' });
    }

    const body = await res.json().catch(() => ({ error: 'Registrácia zlyhala' }));
    if (!res.ok) {
      const bodyCode = (body as { code?: string }).code;
      return fail(res.status, {
        errorCode: bodyCode,
        error: (body as { error?: string }).error ?? 'Registrácia zlyhala',
      });
    }

    const { sessionId } = body as { sessionId: string };
    setSessionCookie(cookies, sessionId);
    redirect(303, '/dashboard');
  },
} satisfies Actions;
