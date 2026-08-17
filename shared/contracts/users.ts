import { z } from 'zod';

export interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  avatar_url: string | null;
}

export const UserIdsSchema = z
  .array(z.string().uuid('معرّف مستخدم غير صالح'))
  .max(50, 'الحد الأقصى 50 مستخدم');

export type UserIdsInput = z.infer<typeof UserIdsSchema>;

export const AdminUsersSearchSchema = z.object({
  search: z.string().trim().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50),
});

export type AdminUsersSearchInput = z.infer<typeof AdminUsersSearchSchema>;
