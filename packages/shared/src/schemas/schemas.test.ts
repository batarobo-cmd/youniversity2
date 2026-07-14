import { describe, expect, test } from 'bun:test';
import {
  createLoginSchema,
  createCourseSchema,
  profilePatchSchema,
  registerSchema,
  updateProgressSchema,
} from './index';

describe('registerSchema', () => {
  test('accepts valid registration payload', () => {
    const result = registerSchema.safeParse({
      email: 'student@example.com',
      password: 'password123',
      givenName: 'Ján',
      familyName: 'Novák',
    });
    expect(result.success).toBe(true);
  });

  test('rejects honeypot field', () => {
    const result = registerSchema.safeParse({
      email: 'student@example.com',
      password: 'password123',
      givenName: 'Ján',
      familyName: 'Novák',
      companyWebsite: 'spam',
    });
    expect(result.success).toBe(false);
  });
});

describe('createLoginSchema', () => {
  test('requires email format in production mode', () => {
    const result = createLoginSchema().safeParse({ email: 'not-an-email', password: 'x' });
    expect(result.success).toBe(false);
  });

  test('allows short login ids in dev mode', () => {
    const result = createLoginSchema({ devCredentials: true }).safeParse({
      email: 'admin',
      password: 'admin',
    });
    expect(result.success).toBe(true);
  });
});

describe('createCourseSchema', () => {
  test('defaults locale to sk', () => {
    const result = createCourseSchema.safeParse({
      slug: 'onboarding',
      title: 'Onboarding',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.defaultLocale).toBe('sk');
  });
});

describe('profilePatchSchema', () => {
  test('accepts partial profile update', () => {
    const result = profilePatchSchema.safeParse({ preferredLocale: 'en' });
    expect(result.success).toBe(true);
  });
});

describe('updateProgressSchema', () => {
  test('requires lesson uuid', () => {
    const result = updateProgressSchema.safeParse({
      lessonId: 'not-a-uuid',
      percentComplete: 50,
    });
    expect(result.success).toBe(false);
  });
});
