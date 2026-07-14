import { describe, expect, test } from 'bun:test';
import { isEmailDomainAllowed } from './auth-settings';

describe('isEmailDomainAllowed', () => {
  test('allows any domain when list is empty', () => {
    expect(isEmailDomainAllowed('user@example.com', [])).toBe(true);
  });

  test('matches exact domain', () => {
    expect(isEmailDomainAllowed('user@company.sk', ['company.sk'])).toBe(true);
    expect(isEmailDomainAllowed('user@other.sk', ['company.sk'])).toBe(false);
  });

  test('matches subdomain of allowed domain', () => {
    expect(isEmailDomainAllowed('user@mail.company.sk', ['company.sk'])).toBe(true);
  });
});
