import { z } from 'zod';
import { slugSchema, uuidSchema } from './_helpers';

export const createCategorySchema = z.object({
  slug: slugSchema,
  name: z.string().min(2).max(255),
  sortOrder: z.number().int().optional(),
  parentId: uuidSchema.nullable().optional(),
});

export const updateCategorySchema = z.object({
  slug: slugSchema.optional(),
  name: z.string().min(2).max(255).optional(),
  sortOrder: z.number().int().optional(),
  parentId: uuidSchema.nullable().optional(),
});

export type CreateCategoryInput = z.infer<typeof createCategorySchema>;
