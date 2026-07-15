const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'accessToken',
  'refreshToken',
  'secret',
  'authorization',
  'passwordHash',
  'systemAdminPasswordHash',
]);

function redactEmail(email: string | null | undefined): string | undefined {
  if (!email) return undefined;
  const at = email.indexOf('@');
  if (at <= 0) return '***';
  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

function redactIp(ip: string | null | undefined): string | undefined {
  if (!ip) return undefined;
  if (ip.includes('.')) {
    const parts = ip.split('.');
    if (parts.length === 4) {
      parts[3] = 'xxx';
      return parts.join('.');
    }
  }
  if (ip.includes(':')) {
    const parts = ip.split(':');
    parts[parts.length - 1] = 'xxxx';
    return parts.join(':');
  }
  return 'xxx';
}

function redactValue(key: string, value: unknown): unknown {
  if (SENSITIVE_KEYS.has(key)) return '[REDACTED]';
  if (typeof value === 'string' && key.toLowerCase().includes('email')) {
    return redactEmail(value) ?? '[REDACTED]';
  }
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return redactObject(value as Record<string, unknown>);
  }
  return value;
}

export function redactObject<T extends Record<string, unknown>>(obj: T): T {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    next[key] = redactValue(key, value);
  }
  return next as T;
}

export function redactReportRow(row: Record<string, unknown>): Record<string, unknown> {
  const next = { ...row };
  if (typeof next.userEmail === 'string') next.userEmail = redactEmail(next.userEmail);
  if (typeof next.email === 'string') next.email = redactEmail(next.email);
  if (typeof next.ipAddress === 'string') next.ipAddress = redactIp(next.ipAddress);
  if (next.payload && typeof next.payload === 'object') {
    next.payload = redactObject(next.payload as Record<string, unknown>);
  }
  return next;
}

export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const escape = (value: unknown) => {
    const text =
      value === null || value === undefined
        ? ''
        : typeof value === 'object'
          ? JSON.stringify(value)
          : String(value);
    if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
    return text;
  };
  const lines = [headers.join(',')];
  for (const row of rows) {
    lines.push(headers.map((h) => escape(row[h])).join(','));
  }
  return lines.join('\n');
}
