import { describe, expect, test } from 'bun:test';
import { clientIpFromHeaders } from './rate-limit';

describe('clientIpFromHeaders', () => {
  test('uses first X-Forwarded-For address', () => {
    expect(clientIpFromHeaders('203.0.113.1, 198.51.100.2', null)).toBe('203.0.113.1');
  });

  test('falls back to X-Real-IP', () => {
    expect(clientIpFromHeaders(null, '198.51.100.9')).toBe('198.51.100.9');
  });

  test('returns undefined when headers missing', () => {
    expect(clientIpFromHeaders(undefined, undefined)).toBeUndefined();
  });
});
