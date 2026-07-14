import { z } from 'zod';
import { uuidSchema } from './_helpers';

export const updateProgressSchema = z.object({
  lessonId: uuidSchema,
  percentComplete: z.number().min(0).max(100).optional(),
  isComplete: z.boolean().optional(),
  score: z.number().min(0).max(100).optional(),
  state: z.record(z.unknown()).optional(),
});

export type UpdateProgressInput = z.infer<typeof updateProgressSchema>;
