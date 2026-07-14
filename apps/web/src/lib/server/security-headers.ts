const WEB_CSP = [
  "default-src 'self'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'self'",
  "object-src 'none'",
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com https://www.youtube.com https://player.vimeo.com",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com data:",
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https: wss: ws:",
  "frame-src 'self' https://www.youtube.com https://www.youtube-nocookie.com https://player.vimeo.com https://vimeo.com https://challenges.cloudflare.com",
  "worker-src 'self' blob:",
].join('; ');

export function applyWebSecurityHeaders(headers: Headers, options?: { hsts?: boolean }) {
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'SAMEORIGIN');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  headers.set('X-DNS-Prefetch-Control', 'off');
  headers.set('Content-Security-Policy', WEB_CSP);

  if (options?.hsts) {
    headers.set('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  }
}
