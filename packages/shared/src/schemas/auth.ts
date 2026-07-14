import { z } from 'zod';
import { normalizePersonName, isSafePersonName } from '../validation';
import { localeSchema } from './_helpers';

export const personNameSchema = z
  .string()
  .min(1)
  .max(100)
  .transform(normalizePersonName)
  .refine(isSafePersonName, { message: 'Invalid name' });

export const registerSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z.string().min(8).max(128),
  givenName: personNameSchema,
  familyName: personNameSchema,
  preferredLocale: localeSchema.optional(),
  turnstileToken: z.string().max(2048).optional(),
  /** Honeypot — must stay empty. */
  companyWebsite: z.string().max(0).optional(),
});

export function createLoginSchema(options?: { devCredentials?: boolean }) {
  if (options?.devCredentials) {
    return z.object({
      email: z.string().min(1),
      password: z.string(),
    });
  }
  return z.object({
    email: z.string().email(),
    password: z.string().min(1),
  });
}

export const systemAdminPasswordSchema = z
  .object({
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Protection passwords do not match',
    path: ['confirmPassword'],
  });

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<ReturnType<typeof createLoginSchema>>;
