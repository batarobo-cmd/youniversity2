import { createLoginSchema, firstZodIssue, registerSchema } from '@youniversity2/shared';
import type { ZodError } from 'zod';

export function parseLoginForm(data: unknown, devCredentials: boolean) {
  return createLoginSchema({ devCredentials }).safeParse(data);
}

export function parseRegisterForm(data: unknown) {
  return registerSchema.safeParse(data);
}

export function zodFormMessage(error: ZodError): string {
  return firstZodIssue(error);
}
