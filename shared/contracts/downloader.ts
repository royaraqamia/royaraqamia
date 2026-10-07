import { z } from 'zod';

// ------------------------------------------------------------
// Enums & primitives
// ------------------------------------------------------------

/**
 * A Download's format is one flat enum, so an invalid audio/quality
 * combination is unrepresentable rather than rejected at runtime.
 */
export const DOWNLOAD_FORMATS = ['audio', 'video-360p', 'video-720p', 'video-1080p'] as const;
export type DownloadFormat = (typeof DOWNLOAD_FORMATS)[number];

export const DOWNLOAD_FORMAT_LABELS: Record<DownloadFormat, string> = {
  audio: 'صوت فقط (m4a)',
  'video-360p': 'فيديو 360p',
  'video-720p': 'فيديو 720p',
  'video-1080p': 'فيديو 1080p',
};

/**
 * The short life of a Download Job: accepted, working, done, or one of the two
 * terminals. Vocabulary fixed in CONTEXT.md ("Download Status").
 */
export const DOWNLOAD_STATUSES = ['queued', 'running', 'ready', 'failed', 'expired'] as const;
export type DownloadStatus = (typeof DOWNLOAD_STATUSES)[number];

export const DOWNLOAD_STATUS_LABELS: Record<DownloadStatus, string> = {
  queued: 'في الانتظار',
  running: 'جارٍ المعالجة',
  ready: 'جاهز للتنزيل',
  failed: 'فشل',
  expired: 'انتهت صلاحية الرابط',
};

/** Statuses after which no further transition happens. */
export const TERMINAL_DOWNLOAD_STATUSES: readonly DownloadStatus[] = ['ready', 'failed', 'expired'];

export const MAX_SOURCE_URL_LENGTH = 2048;

/** The one definition of "a link a Download may target"; shared by the schema and the provider. */
export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

// ------------------------------------------------------------
// Validation schemas
// ------------------------------------------------------------

export const DownloadFormatSchema = z.enum(DOWNLOAD_FORMATS);

export const CreateDownloadJobSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, 'أدخل رابط الوسائط.')
    .max(MAX_SOURCE_URL_LENGTH, 'الرابط طويل جدًّا.')
    .refine(isHttpUrl, 'الرابط غير صحيح؛ يجب أن يبدأ بـ http أو https.'),
  format: DownloadFormatSchema,
});

export type CreateDownloadJobInput = z.infer<typeof CreateDownloadJobSchema>;

// ------------------------------------------------------------
// Entities
// ------------------------------------------------------------

/** The signed, expiring link a ready Download points at. Never stored media. */
export interface DownloadJobFile {
  url: string;
  filename: string;
  sizeBytes: number;
  expiresAt: string;
}

/**
 * The short-lived record of one Download, tracked from acceptance to delivery.
 * It is rate-limited, observable and reviewable by an Admin, but carries no
 * media of its own.
 */
export interface DownloadJob {
  id: string;
  sourceUrl: string;
  format: DownloadFormat;
  status: DownloadStatus;
  platform: string | null;
  error: string | null;
  file: DownloadJobFile | null;
  createdAt: string;
  updatedAt: string;
}
