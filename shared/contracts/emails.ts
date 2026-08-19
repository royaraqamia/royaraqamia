import { z } from 'zod';
import { UserIdsSchema } from '@/shared/contracts/users';

export const EmailSendSchema = z.object({
  subject: z.string().trim().min(1, 'الموضوع مطلوب').max(120, 'الموضوع طويل جداً'),
  body: z.string().trim().max(5000, 'نص البريد طويل جداً').optional(),
  userIds: UserIdsSchema.optional(),
});

export type EmailSendInput = z.infer<typeof EmailSendSchema>;

export const BroadcastChannelsSchema = z.object({
  notification: z.boolean().default(true),
  email: z.boolean().default(false),
});

export type BroadcastChannels = z.infer<typeof BroadcastChannelsSchema>;

export const BroadcastSendSchema = z.object({
  title: z.string().trim().min(1, 'العنوان مطلوب').max(120, 'العنوان طويل جداً'),
  body: z.string().trim().max(1000, 'نص الإعلان طويل جداً').optional(),
  userIds: UserIdsSchema.optional(),
  channels: BroadcastChannelsSchema.optional(),
});

export type BroadcastSendInput = z.infer<typeof BroadcastSendSchema>;

export interface BroadcastResult {
  success: boolean;
  sent?: number;
  emailsSent?: number;
  error?: string;
}
