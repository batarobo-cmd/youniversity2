import { z } from 'zod';
import { ACTIVITY_TYPES } from '../constants';
import { uuidSchema } from './_helpers';

export const activityTypeSchema = z.enum(ACTIVITY_TYPES);

export const createModuleSchema = z.object({
  title: z.string().min(1).max(500),
  sortOrder: z.number().int().min(0).optional(),
});

export const updateModuleSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  sortOrder: z.number().int().min(0).optional(),
  isRequired: z.boolean().optional(),
});

export const createActivitySchema = z
  .object({
    type: activityTypeSchema,
    title: z.string().min(1).max(500).optional(),
    content: z.string().optional(),
    sortOrder: z.number().int().min(0).optional(),
    isRequired: z.boolean().optional(),
    config: z.record(z.unknown()).optional(),
  })
  .refine((data) => data.type === 'text' || Boolean(data.title?.trim()), {
    message: 'title required',
  });

export const updateActivitySchema = z.object({
  type: activityTypeSchema.optional(),
  title: z.string().min(1).max(500).optional(),
  content: z.string().optional().nullable(),
  moduleId: uuidSchema.optional(),
  sortOrder: z.number().int().min(0).optional(),
  isRequired: z.boolean().optional(),
  config: z.record(z.unknown()).optional(),
});
