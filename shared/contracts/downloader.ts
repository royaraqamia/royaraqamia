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

/** Hard caps enforced server-side; the visitor sees them from the copy on the tool page. */
export const MAX_DOWNLOAD_DURATION_SECONDS = 15 * 60;
export const MAX_DOWNLOAD_AUDIO_BYTES = 50 * 1024 * 1024;
export const MAX_DOWNLOAD_VIDEO_BYTES = 200 * 1024 * 1024;

export function maxDownloadBytes(format: DownloadFormat): number {
  return format === 'audio' ? MAX_DOWNLOAD_AUDIO_BYTES : MAX_DOWNLOAD_VIDEO_BYTES;
}

/**
 * How long the Media Provider's signed file link stays valid. The provider sets
 * `DownloadJobFile.expiresAt` from this, and the app treats a ready job as
 * `expired` once that moment passes — the link is never handed out again.
 */
export const DOWNLOAD_LINK_TTL_SECONDS = 5 * 60;

/** The one definition of "a link a Download may target"; shared by the schema and the provider. */
export function isHttpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

const PRIVATE_IPV4 = (a: number, b: number): boolean => {
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 169 && b === 254) return true;
  return false;
};

/**
 * SSRF guard: an http(s) URL whose host is a public name or address. Rejects
 * loopback and the private/link-local IPv4 ranges, and refuses every IPv6
 * literal (including IPv4-mapped forms like `::ffff:127.0.0.1`) rather than
 * trying to classify them. Hostnames that *resolve* to a private address are
 * the provider host's concern, not this client-side check.
 */
export function isPublicHttpUrl(value: string): boolean {
  if (!isHttpUrl(value)) return false;

  let host: string;
  try {
    host = new URL(value).hostname.toLowerCase().replace(/^\[|\]$/g, '');
  } catch {
    return false;
  }

  if (host.length === 0) return false;
  if (host === 'localhost' || host.endsWith('.localhost')) return false;
  if (host.includes(':')) return false;

  const octets = host.split('.');
  if (octets.length === 4 && octets.every((octet) => /^\d+$/.test(octet))) {
    const [a = -1, b = -1] = octets.map(Number);
    if (PRIVATE_IPV4(a, b)) return false;
  }

  return true;
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
    .refine(isPublicHttpUrl, 'الرابط غير مدعوم؛ يجب أن يكون رابطًا عامًّا يبدأ بـ http أو https.'),
  format: DownloadFormatSchema,
  /** Cloudflare Turnstile token; required when the server has a secret configured. */
  turnstileToken: z.string().trim().max(4096).optional(),
});

export type CreateDownloadJobInput = z.infer<typeof CreateDownloadJobSchema>;

/** The part of a create request the download pipeline itself needs. */
export type DownloadRequest = Pick<CreateDownloadJobInput, 'url' | 'format'>;

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
