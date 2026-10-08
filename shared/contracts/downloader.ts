import { z } from 'zod';

// ------------------------------------------------------------
// Enums & primitives
// ------------------------------------------------------------

/**
 * A Download's format is one flat enum, so an invalid audio/quality
 * combination is unrepresentable rather than rejected at runtime.
 */
export const DOWNLOAD_FORMATS = [
  'audio',
  'audio-mp3',
  'video-360p',
  'video-480p',
  'video-720p',
  'video-1080p',
  'image-original',
  'image-jpg',
  'image-png',
  'image-webp',
] as const;
export type DownloadFormat = (typeof DOWNLOAD_FORMATS)[number];

export const DOWNLOAD_FORMAT_LABELS: Record<DownloadFormat, string> = {
  audio: 'صوت فقط (m4a)',
  'audio-mp3': 'صوت فقط (mp3)',
  'video-360p': 'فيديو 360p',
  'video-480p': 'فيديو 480p',
  'video-720p': 'فيديو 720p',
  'video-1080p': 'فيديو 1080p',
  'image-original': 'صورة (الصيغة الأصلية)',
  'image-jpg': 'صورة (jpg)',
  'image-png': 'صورة (png)',
  'image-webp': 'صورة (webp)',
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

// ------------------------------------------------------------
// Link inspection (pre-download probe)
// ------------------------------------------------------------

/** The broad kind of media a link resolves to; drives which formats are offered. */
export const MEDIA_KINDS = ['video', 'audio', 'image'] as const;
export type MediaKind = (typeof MEDIA_KINDS)[number];

export const MEDIA_KIND_LABELS: Record<MediaKind, string> = {
  video: 'فيديو',
  audio: 'صوت',
  image: 'صورة',
};

/** A format the provider would let the visitor pick, with an estimated size. */
export interface ProbeFormat {
  format: DownloadFormat;
  /** Best-effort size in bytes; `null` when the provider cannot estimate it. */
  filesizeBytes: number | null;
}

/**
 * The successful outcome of inspecting a link before any download: what it is,
 * what we can produce from it, and roughly how big each option is. Produced by
 * the Media Provider's `inspect` and cached, so the format field can adapt to
 * the link without spending a full download.
 */
export interface ProbeSuccess {
  status: 'ok';
  platform: string | null;
  platformName: string | null;
  mediaType: MediaKind;
  title: string | null;
  durationSeconds: number | null;
  thumbnailUrl: string | null;
  formats: ProbeFormat[];
}

/** Why a link cannot be offered formats right now (the same vocabulary as download failures). */
export const PROBE_FAILURE_STATUSES = ['blocked', 'unavailable', 'unsupported', 'unknown'] as const;
export type ProbeFailureStatus = (typeof PROBE_FAILURE_STATUSES)[number];

export interface ProbeFailure {
  status: ProbeFailureStatus;
  message: string;
}

/** Everything an inspect call can say: either formats, or a reason there are none. */
export type ProbeResult = ProbeSuccess | ProbeFailure;

export const MAX_SOURCE_URL_LENGTH = 2048;

/**
 * The default caps, enforced server-side; an Admin can tune the live values at
 * runtime (ADR-0020), and the visitor sees them from the copy on the tool page.
 */
export const MAX_DOWNLOAD_DURATION_SECONDS = 15 * 60;
export const MAX_DOWNLOAD_AUDIO_BYTES = 50 * 1024 * 1024;
export const MAX_DOWNLOAD_VIDEO_BYTES = 200 * 1024 * 1024;
/** Images are small; a fixed cap keeps them out of the Admin-tunable settings. */
export const MAX_DOWNLOAD_IMAGE_BYTES = 25 * 1024 * 1024;

/**
 * How long the Media Provider's signed file link stays valid. The provider sets
 * `DownloadJobFile.expiresAt` from this, and the app treats a ready job as
 * `expired` once that moment passes — the link is never handed out again.
 */
export const DOWNLOAD_LINK_TTL_SECONDS = 5 * 60;

/** The size caps that depend on the requested format. */
export interface DownloadCaps {
  maxDurationSeconds: number;
  maxAudioBytes: number;
  maxVideoBytes: number;
}

/**
 * The full set of limits an Admin can tune without a deploy. The row lives in
 * `downloader_settings`; `DEFAULT_DOWNLOAD_SETTINGS` is what the app falls back
 * to when the row is absent.
 */
export interface DownloadSettings extends DownloadCaps {
  maxConcurrentJobs: number;
  linkTtlSeconds: number;
}

export const DEFAULT_DOWNLOAD_SETTINGS: DownloadSettings = {
  maxDurationSeconds: MAX_DOWNLOAD_DURATION_SECONDS,
  maxAudioBytes: MAX_DOWNLOAD_AUDIO_BYTES,
  maxVideoBytes: MAX_DOWNLOAD_VIDEO_BYTES,
  maxConcurrentJobs: 20,
  linkTtlSeconds: DOWNLOAD_LINK_TTL_SECONDS,
};

export function maxDownloadBytes(
  format: DownloadFormat,
  caps: DownloadCaps = DEFAULT_DOWNLOAD_SETTINGS
): number {
  const kind = mediaKindOfFormat(format);
  if (kind === 'audio') return caps.maxAudioBytes;
  if (kind === 'image') return MAX_DOWNLOAD_IMAGE_BYTES;
  return caps.maxVideoBytes;
}

/** The media kind a format belongs to; the prefix is the single source of truth. */
export function mediaKindOfFormat(format: DownloadFormat): MediaKind {
  if (format.startsWith('image')) return 'image';
  if (format.startsWith('audio')) return 'audio';
  return 'video';
}

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

/**
 * The one definition of the "public media link" field, shared by the create and
 * inspect paths so both refuse the same inputs with the same copy.
 */
const SourceUrlSchema = z
  .string()
  .trim()
  .min(1, 'أدخل رابط الوسائط.')
  .max(MAX_SOURCE_URL_LENGTH, 'الرابط طويل جدًّا.')
  .refine(isPublicHttpUrl, 'الرابط غير مدعوم؛ يجب أن يكون رابطًا عامًّا يبدأ بـ http أو https.');

export const CreateDownloadJobSchema = z.object({
  url: SourceUrlSchema,
  format: DownloadFormatSchema,
  /** Cloudflare Turnstile token; required when the server has a secret configured. */
  turnstileToken: z.string().trim().max(4096).optional(),
});

export type CreateDownloadJobInput = z.infer<typeof CreateDownloadJobSchema>;

/** The inspect path validates the same public link and nothing else. */
export const InspectDownloadLinkSchema = z.object({ url: SourceUrlSchema });

export type InspectDownloadLinkInput = z.infer<typeof InspectDownloadLinkSchema>;

/** The part of a create request the download pipeline itself needs. */
export type DownloadRequest = Pick<CreateDownloadJobInput, 'url' | 'format'>;

const DownloadCallbackFileSchema = z.object({
  url: z.string().url(),
  filename: z.string().trim().min(1).max(255),
  sizeBytes: z.number().int().nonnegative(),
  expiresAt: z.string().min(1),
});

/**
 * What a Media Provider posts to the internal callback route once a Download
 * finishes. `ready` carries the signed, expiring link; `failed` carries a reason
 * the visitor can read. The route authenticates the caller by shared secret;
 * this schema only guards the payload's shape.
 */
export const DownloadCallbackSchema = z.discriminatedUnion('status', [
  z.object({
    jobId: z.string().uuid(),
    status: z.literal('ready'),
    platform: z.string().trim().min(1).max(255).nullish(),
    durationSeconds: z.number().nonnegative(),
    file: DownloadCallbackFileSchema,
  }),
  z.object({
    jobId: z.string().uuid(),
    status: z.literal('failed'),
    /**
     * Optional machine-readable reason the provider classified (e.g. `blocked`,
     * `unavailable`, `duration`, `unsupported`). `error` stays the visitor copy;
     * this is for observability, and older providers that omit it are still valid.
     */
    code: z.string().trim().max(50).optional(),
    error: z.string().trim().min(1).max(1000),
  }),
]);

export type DownloadCallback = z.infer<typeof DownloadCallbackSchema>;

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

// ------------------------------------------------------------
// Admin Console (ADR-0020)
// ------------------------------------------------------------

/**
 * A blocklist entry either bans a whole host and its subdomains (`domain`) or one
 * exact link (`url`). Blocked links are refused on the create path.
 */
export const DOWNLOAD_BLOCK_KINDS = ['domain', 'url'] as const;
export type DownloadBlockKind = (typeof DOWNLOAD_BLOCK_KINDS)[number];

export const DOWNLOAD_BLOCK_KIND_LABELS: Record<DownloadBlockKind, string> = {
  domain: 'نطاق',
  url: 'رابط',
};

export interface DownloadBlocklistEntry {
  id: string;
  kind: DownloadBlockKind;
  value: string;
  createdAt: string;
  createdBy: string | null;
}

/**
 * One Platform as the Admin Console sees it: the catalogue's identity merged with
 * the runtime override, breaker state and whether the breaker is open right now.
 */
export interface DownloadPlatformView {
  id: string;
  name: string;
  domains: string[];
  enabled: boolean;
  enabledByDefault: boolean;
  consecutiveFailures: number;
  openUntil: string | null;
  breakerOpen: boolean;
}

/** A page of Download Jobs for the Admin list, newest first. */
export interface DownloadJobPage {
  jobs: DownloadJob[];
  total: number;
  page: number;
  pageSize: number;
}

const HOSTNAME_RE = /^(?=.{1,253}$)([a-z0-9](?:-?[a-z0-9])*\.)+[a-z]{2,}$/i;

export const AddDownloadBlockSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('domain'),
    value: z
      .string()
      .trim()
      .toLowerCase()
      .min(1, 'أدخل نطاقًا.')
      .max(253)
      .regex(HOSTNAME_RE, 'أدخل اسم نطاق صحيحًا.'),
  }),
  z.object({
    kind: z.literal('url'),
    value: z
      .string()
      .trim()
      .min(1, 'أدخل رابطًا.')
      .max(MAX_SOURCE_URL_LENGTH)
      .refine(isHttpUrl, 'أدخل رابطًا صحيحًا يبدأ بـ http أو https.'),
  }),
]);

export type AddDownloadBlockInput = z.infer<typeof AddDownloadBlockSchema>;

export const SetDownloadPlatformEnabledSchema = z.object({
  enabled: z.boolean(),
});

export type SetDownloadPlatformEnabledInput = z.infer<typeof SetDownloadPlatformEnabledSchema>;

const MB = 1024 * 1024;

/**
 * A partial update of the tunable limits; at least one field must be present.
 * Bounds keep an Admin from setting a nonsensical (or unbounded) value.
 */
export const UpdateDownloadSettingsSchema = z
  .object({
    maxDurationSeconds: z
      .number()
      .int()
      .min(30)
      .max(24 * 60 * 60)
      .optional(),
    maxAudioBytes: z
      .number()
      .int()
      .min(MB)
      .max(2 * 1024 * MB)
      .optional(),
    maxVideoBytes: z
      .number()
      .int()
      .min(MB)
      .max(5 * 1024 * MB)
      .optional(),
    maxConcurrentJobs: z.number().int().min(1).max(200).optional(),
    linkTtlSeconds: z
      .number()
      .int()
      .min(30)
      .max(60 * 60)
      .optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: 'لا توجد قيم للتحديث.',
  });

export type UpdateDownloadSettingsInput = z.infer<typeof UpdateDownloadSettingsSchema>;
