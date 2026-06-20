import { z } from 'zod';

export const taskStatus = z.enum(['OPEN', 'IN_PROGRESS', 'DONE', 'LOCAL_DONE', 'TO_TEST', 'DEPLOYED', 'MIGRATED', 'CANCELLED', 'SCHEDULED']);

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date attendue au format YYYY-MM-DD');

export const syncTaskInput = z.object({
  id: z.string().min(1).max(64),
  title: z.string().min(1).max(500).trim(),
  notes: z.string().max(10_000).nullable(),
  status: taskStatus,
  dueDate: isoDate.nullable(),
  completedAt: z.string().datetime().nullable(),
  category: z.string().max(100).nullable().optional(),
  taskType: z.string().max(50).nullable().optional(),
  priority: z.enum(['HIGH', 'MEDIUM', 'LOW']).nullable().optional(),
  sortOrder: z.number().nullable().optional(),
  createdBy: z.string().max(64).nullable().optional(),
  version: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  deletedAt: z.string().datetime().nullable(),
});

export type SyncTaskInput = z.infer<typeof syncTaskInput>;
export type TaskStatus = z.infer<typeof taskStatus>;
