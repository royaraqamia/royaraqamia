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

/**
 * Public member identity, safe to render on the community pages. Deliberately
 * excludes email and `is_admin` even though the read runs on the service role —
 * the projection is the contract, not the query.
 */
export interface PublicUser {
  id: string;
  username: string;
  name: string | null;
  avatar_url: string | null;
  bio: string | null;
  /** Mirrors auth `email_confirmed_at`; only verified members are listed. */
  verified: boolean;
}

/**
 * A public handle: 3-30 chars, lower-case ascii or Arabic letters/digits plus
 * inner hyphens, with no leading or trailing hyphen. Kept in lockstep with the
 * `public.assign_username` trigger.
 */
export const UsernameSchema = z
  .string()
  .trim()
  .transform((value) => value.toLowerCase())
  .pipe(
    z
      .string()
      .min(3, 'المعرّف قصير جدًا')
      .max(30, 'المعرّف طويل جدًا')
      .regex(
        /^[a-z0-9\u0621-\u064A][a-z0-9\u0621-\u064A-]*[a-z0-9\u0621-\u064A]$/,
        'المعرّف يقبل الحروف والأرقام والشرطة فقط'
      )
  );

export const UpdateUsernameSchema = z.object({
  username: UsernameSchema,
});

export type UpdateUsernameInput = z.infer<typeof UpdateUsernameSchema>;
