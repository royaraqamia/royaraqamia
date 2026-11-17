import { z } from 'zod';

export interface AdminUser {
  id: string;
  name: string | null;
  email: string;
  avatar_url: string | null;
  /** Internal row (ADR-0127); the picker labels it so nobody wonders where it went. */
  is_hidden: boolean;
}

export const UserIdsSchema = z
  .array(z.string().uuid('معرِّف مستخدم غير صالح'))
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
 * A member as the profile route reads them: the public identity plus the one
 * flag that decides whether the viewer may see the page at all (ADR-0127).
 *
 * The list shapes stay `PublicUser` — a hidden row is never in them, so nothing
 * that renders a roster can leak the flag. Only the single-row read carries it,
 * because only that read has a viewer to ask.
 */
export interface MemberProfile extends PublicUser {
  is_hidden: boolean;
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
      .min(3, 'المعرِّف قصير جدًا')
      .max(30, 'المعرِّف طويل جدًا')
      .regex(
        /^[a-z0-9\u0621-\u064A][a-z0-9\u0621-\u064A-]*[a-z0-9\u0621-\u064A]$/,
        'المعرِّف يقبل الحروف والأرقام والشرطة فقط'
      )
  );

export const UpdateUsernameSchema = z.object({
  username: UsernameSchema,
});

export type UpdateUsernameInput = z.infer<typeof UpdateUsernameSchema>;

/** Display name shown beside a member's avatar across the site. */
export const ProfileNameSchema = z.string().trim().min(1, 'الاسم مطلوب').max(80, 'الاسم طويل جدًا');

/**
 * The handles one render wants to know about (ADR-0192). A batch, not a stream:
 * a chat thread asks once for the handles on its screen, and the ceiling is the
 * same number the composer's own list uses, so one message cannot ask about the
 * whole directory.
 */
export const MentionHandlesSchema = z.object({
  handles: z.array(z.string().trim().min(1).max(64)).max(50),
});

export type MentionHandlesInput = z.infer<typeof MentionHandlesSchema>;

/**
 * What `POST /api/users/mentions` answers: the handles among the request that
 * name a listed member. Absent means "no such member", which renders the handle
 * as plain text — the same answer a network failure gets, so a mention is never
 * a link to a 404.
 */
export const MentionResolveResponseSchema = z.object({
  handles: z.array(z.string()),
});

export type MentionResolveResponse = z.infer<typeof MentionResolveResponseSchema>;

/**
 * What `GET /api/me` answers: the caller's identity as the account card draws
 * it. The app reads the same route the page's session provider reads, so the
 * profile card cannot show a name or an avatar the page would not (#946,
 * ADR-0098). `isAdmin` is a boolean, never the allowlist.
 */
export const MeResponseSchema = z.object({
  isAdmin: z.boolean(),
  name: z.string().nullable(),
  email: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  username: z.string().nullable(),
  /** The public-profile bio, from the same row the account card edits. */
  bio: z.string().nullable(),
});

export type MeResponse = z.infer<typeof MeResponseSchema>;

export const UpdateNameSchema = z.object({
  name: ProfileNameSchema,
});

export type UpdateNameInput = z.infer<typeof UpdateNameSchema>;

/**
 * The short biography a member writes for their public profile. The 500-char
 * ceiling is the one the database column and the MCP profile tool already use;
 * keeping it here makes the site, the app and the agent agree on one rule.
 * An empty value clears the bio (stored as null) rather than saving a blank.
 */
export const ProfileBioSchema = z.string().trim().max(500, 'النبذة طويلة جدًا');

export const UpdateBioSchema = z.object({
  bio: ProfileBioSchema,
});

export type UpdateBioInput = z.infer<typeof UpdateBioSchema>;

/** What `PATCH /api/me/bio` answers, mirroring the name write. */
export const UpdateBioResponseSchema = z.object({
  success: z.boolean(),
  bio: z.string().nullable().optional(),
  error: z.string().optional(),
});

export type UpdateBioResponse = z.infer<typeof UpdateBioResponseSchema>;

/**
 * What `PATCH /api/me/name` answers: the name it kept, or the sentence that
 * refused it. The app decodes this instead of guessing from the status, so a
 * route that starts answering a different shape is a compile error in Kotlin
 * (#945, ADR-0098).
 */
export const UpdateNameResponseSchema = z.object({
  success: z.boolean(),
  name: z.string().optional(),
  error: z.string().optional(),
});

export type UpdateNameResponse = z.infer<typeof UpdateNameResponseSchema>;

/**
 * What `POST /api/me/avatar` answers: the public URL the profile now points at,
 * or the sentence that refused the image. The same route the page's
 * `ProfileEditor` posts to, so the app cannot invent a second upload contract
 * (#945).
 */
export const AvatarUploadResponseSchema = z.object({
  success: z.boolean(),
  avatarUrl: z.string().optional(),
  error: z.string().optional(),
});

export type AvatarUploadResponse = z.infer<typeof AvatarUploadResponseSchema>;

/** Validation the avatar upload endpoint and the editor both enforce. */
export const AVATAR_MAX_BYTES = 5 * 1024 * 1024;
export const AVATAR_ALLOWED_MIME_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
  'image/avif',
] as const;
