import { z } from 'zod';
import { SUPPORTED_LOCALES } from '../constants';

export const localeSchema = z.enum(SUPPORTED_LOCALES);

export const optionalString = (max: number) => z.string().max(max).optional().nullable();

export const slugSchema = z.string().trim().min(2).max(255);

export const uuidSchema = z.string().uuid();

export function firstZodIssue(error: z.ZodError): string {
  return error.issues[0]?.message ?? 'Invalid input';
}
