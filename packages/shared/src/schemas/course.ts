import { z } from 'zod';
import { localeSchema, optionalString, slugSchema, uuidSchema } from './_helpers';

export const createCourseSchema = z.object({
  slug: slugSchema,
  defaultLocale: localeSchema.default('sk'),
  title: z.string().min(2),
  description: z.string().optional(),
  categoryId: uuidSchema.optional().nullable(),
});

export const publishCourseSchema = z.object({
  isPublished: z.boolean(),
});

export const translateCourseSchema = z.object({
  targetLocale: localeSchema,
});

export type CreateCourseInput = z.infer<typeof createCourseSchema>;
