import { z } from 'zod';

export const TOPIC_REQUEST_STATUSES = ['PENDING', 'IN_PROGRESS', 'DONE', 'REJECTED'] as const;
export const topicRequestStatusSchema = z.enum(TOPIC_REQUEST_STATUSES);
export type TopicRequestStatus = z.infer<typeof topicRequestStatusSchema>;

export const createTopicRequestInput = z.object({
  title: z.string().trim().min(1, 'Le sujet est requis').max(200, '200 caractères max'),
  description: z.string().trim().max(2000).optional().nullable(),
});

export const updateTopicRequestStatusInput = z.object({
  id: z.string(),
  status: topicRequestStatusSchema,
  ownerNote: z.string().trim().max(2000).optional().nullable(),
  linkedEntryId: z.string().optional().nullable(),
});

export const listTopicRequestsInput = z.object({
  status: topicRequestStatusSchema.optional(),
  limit: z.number().int().min(1).max(200).default(100),
}).optional();
