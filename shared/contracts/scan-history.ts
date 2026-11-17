import { z } from 'zod';

import {
  SCAN_RESULT_KIND_LABELS,
  contactName,
  type ScanClassification,
  type ScanResultKind,
} from './scan';

/**
 * What a scan leaves behind, when the member is signed in (ADR-0205).
 *
 * The row is a **summary, and only a summary**: the kind, the format, and one
 * identifying label. The payload never leaves the device — not because the
 * server filters it, but because the write this module builds has nowhere to put
 * it. The schema below is strict for the same reason: a client that tried to send
 * `value` alongside these three fields is refused, so "we do not store the code"
 * is a property of the route rather than a promise in a comment.
 *
 * The label is chosen per kind from the part of the payload that identifies the
 * code without being the secret:
 *
 *   link     the host. Not the path, not the query: a signed URL and a tracking
 *            parameter both live there.
 *   email    the domain. The local part is the person.
 *   phone    the last three digits, masked. Enough to know which number.
 *   sms      the same number the message would go to.
 *   wifi     the SSID. The password is the payload's point and stays on device.
 *   contact  the display name. An address book is not a scan log.
 *   location the coordinates are a movement record, so the row has none.
 *   otp      the issuer. The secret is the credential.
 *   text     nothing. A plain-text QR can be a password on a card.
 *
 * ADR-0205 records the alternative (a server-side credential vault) and why it
 * was refused: the row would then exist only to be filtered out of every turn,
 * and a turn goes to a model provider.
 */

/** The kinds a row can hold: the Scanner's own vocabulary, not a second one. */
export const SCAN_HISTORY_KINDS = [
  'link',
  'email',
  'phone',
  'sms',
  'wifi',
  'contact',
  'location',
  'otp',
  'text',
] as const satisfies readonly ScanResultKind[];

export type ScanHistoryKind = (typeof SCAN_HISTORY_KINDS)[number];

export const ScanHistoryKindSchema = z.enum(SCAN_HISTORY_KINDS);

/** The shape a row shows beside the kind. `Record` is complete on purpose. */
export const SCAN_HISTORY_KIND_LABELS: Record<ScanHistoryKind, string> = SCAN_RESULT_KIND_LABELS;

/** How many distinct codes one member keeps (ADR-0205, decision 4). */
export const SCAN_HISTORY_LIMIT = 200;

/** How long a row lives, counted from the last time the code was read. */
export const SCAN_HISTORY_RETENTION_DAYS = 90;

/** The longest label the route accepts, and the longest it stores. */
export const SCAN_HISTORY_LABEL_MAX = 120;

/**
 * The one write the Scanner sends.
 *
 * Three fields, all bounded, no `value`. The detector's own names are lowercased
 * and folded to `[a-z0-9_]` before they travel, so a browser that reports
 * `QR_CODE` and one that reports `qr_code` are one row rather than two.
 */
export const ScanHistoryRecordSchema = z.strictObject({
  kind: ScanHistoryKindSchema,
  format: z
    .string()
    .min(1)
    .max(32)
    .regex(/^[a-z0-9_]+$/, 'صيغة غير معروفة'),
  label: z
    .string()
    .max(SCAN_HISTORY_LABEL_MAX, 'التسمية أطول من المسموح')
    .refine((value) => !/\p{Cc}/u.test(value), 'تسمية غير صالحة')
    .nullable()
    .optional(),
});

export type ScanHistoryRecord = z.infer<typeof ScanHistoryRecordSchema>;

/** One row as both clients draw it. */
export const ScanHistoryEntrySchema = z.object({
  id: z.string(),
  kind: ScanHistoryKindSchema,
  format: z.string(),
  label: z.string().nullable(),
  /** `YYYY/MM/DD` in Damascus, so both clients render the same day without a clock. */
  lastSeenDate: z.string(),
  lastSeenAt: z.string(),
  seenCount: z.number().int().positive(),
});

export type ScanHistoryEntry = z.infer<typeof ScanHistoryEntrySchema>;

/** The list, newest first, at most [SCAN_HISTORY_LIMIT] rows. */
export const ScanHistoryResultSchema = z.object({
  success: z.boolean(),
  entries: z.array(ScanHistoryEntrySchema).optional(),
  error: z.string().optional(),
});

export type ScanHistoryResult = z.infer<typeof ScanHistoryResultSchema>;

/** The write's answer: the row as it now stands, or a sentence saying why not. */
export const ScanHistoryRecordResultSchema = z.object({
  success: z.boolean(),
  entry: ScanHistoryEntrySchema.optional(),
  error: z.string().optional(),
});

export type ScanHistoryRecordResult = z.infer<typeof ScanHistoryRecordResultSchema>;

/** The clear's answer: how many rows went, so "nothing was there" is visible. */
export const ScanHistoryClearResultSchema = z.object({
  success: z.boolean(),
  cleared: z.number().int().nonnegative().optional(),
  error: z.string().optional(),
});

export type ScanHistoryClearResult = z.infer<typeof ScanHistoryClearResultSchema>;

/**
 * The summary a decoded payload leaves, computed on the device.
 *
 * Pure and total: every kind answers a row, and the caller never has to decide
 * what is safe to send. A hostile payload's text can reach `label` (a Wi-Fi SSID,
 * a vCard name) — the screen renders it as text, never as HTML, exactly as the
 * result card already does.
 */
export function scanHistoryRecord(
  classification: ScanClassification,
  format: string
): ScanHistoryRecord {
  return {
    kind: classification.kind,
    format: normalizeFormat(format),
    label: labelFor(classification),
  };
}

/** The detector's name, folded: `QR_CODE` and `qr_code` are one format. */
export function normalizeFormat(format: string): string {
  const folded = format
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return folded.length > 0 ? folded : 'unknown';
}

function labelFor(classification: ScanClassification): string | null {
  switch (classification.kind) {
    case 'link':
      return clean(classification.host);
    case 'email':
      return clean(domainOf(classification.value));
    case 'phone':
    case 'sms':
      return maskedNumber(classification.value);
    case 'wifi':
      return clean(classification.wifi?.ssid);
    case 'contact':
      return clean(contactName(classification.value));
    case 'otp':
      // The issuer names the service; the path label often carries the account.
      return clean(classification.otp?.issuer);
    case 'location':
    case 'text':
      return null;
  }
}

/** The domain of a `mailto:` payload, without the person. */
function domainOf(value: string): string | null {
  const withoutQuery = value.split('?')[0] ?? '';
  const at = withoutQuery.lastIndexOf('@');
  return at > 0 ? withoutQuery.slice(at + 1) : null;
}

/** `+963 999 123 456` -> `••• 456`: enough to recognise, not enough to call. */
function maskedNumber(value: string): string | null {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 3 ? `••• ${digits.slice(-3)}` : null;
}

/**
 * One line of printable text: control characters folded to spaces, runs
 * collapsed, and the whole thing inside the column's bound.
 */
function clean(value: string | null | undefined): string | null {
  if (!value) return null;
  const folded = value
    .replace(/\p{Cc}/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (folded.length === 0) return null;
  return folded.length > SCAN_HISTORY_LABEL_MAX
    ? folded.slice(0, SCAN_HISTORY_LABEL_MAX).trim()
    : folded;
}
