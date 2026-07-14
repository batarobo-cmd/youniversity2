import { config } from '../config';

type TurnstileVerifyResponse = {
  success: boolean;
  'error-codes'?: string[];
};

export function isTurnstileConfigured(): boolean {
  return Boolean(config.turnstile.secretKey.trim());
}

/** Canonical Cloudflare siteverify (Spin v2 — no managed Worker). */

export async function verifyTurnstileToken(
  token: string | undefined,
  remoteIp?: string | null,
): Promise<{ ok: true } | { ok: false; code: string }> {
  if (!isTurnstileConfigured()) {
    return { ok: true };
  }

  const trimmed = token?.trim();
  if (!trimmed) {
    return { ok: false, code: 'captcha_required' };
  }

  const body = new URLSearchParams({
    secret: config.turnstile.secretKey,
    response: trimmed,
  });
  if (remoteIp) body.set('remoteip', remoteIp);

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    const data = (await res.json()) as TurnstileVerifyResponse;
    if (data.success) return { ok: true };
    console.warn('[turnstile] verification failed:', data['error-codes']?.join(', ') ?? 'unknown');
    return { ok: false, code: 'captcha_failed' };
  } catch (err) {
    console.warn('[turnstile] verify request failed:', (err as Error).message);
    return { ok: false, code: 'captcha_unavailable' };
  }
}
