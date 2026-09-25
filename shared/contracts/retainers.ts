import { z } from 'zod';
import { whatsappPhoneRegex } from './phone';

// ------------------------------------------------------------
// Client Work — Retainer
//
// A prospective Client asks royaraqamia to take on the monthly maintenance of
// their own projects and receives a Reference Code to quote. The arrangement is
// sold publicly as التَّوظيف الشَّهري.
//
// It records a request, not a subscription: no account, no billing, nothing paid
// on the site (ADR-0005, ADR-0006). "Employment", "employee" and "salary" are
// deliberately not domain terms — the monthly terms belong to the Retainer, and
// the money is collected offline (CONTEXT.md).
// ------------------------------------------------------------

export const RETAINER_STATUSES = ['new', 'contacted', 'active', 'paused', 'ended'] as const;
export type RetainerStatus = (typeof RETAINER_STATUSES)[number];

export const RETAINER_STATUS_LABELS: Record<RetainerStatus, string> = {
  new: 'جديد',
  contacted: 'تمّ التواصل',
  active: 'نشط',
  paused: 'متوقّف مؤقّتًا',
  ended: 'منتهٍ',
};

/** Reference codes are quoted in the WhatsApp handoff — `RET-2026-A7K2M9QX`. */
export const RETAINER_REFERENCE_CODE_REGEX = /^RET-\d{4}-[A-Z0-9]{8}$/;

/**
 * The advertised monthly figure, and the default the `retainers` table stores.
 * It records the agreed terms, not a charge: nothing is collected on the site.
 */
export const RETAINER_DEFAULT_MONTHLY_FEE_USD = 100;

/**
 * Bounds for the two required prose fields, matching the Consultation topic
 * bound. The floors are anti-junk guards, not quality gates: the Admin triages
 * the submitted text.
 */
export const RETAINER_CURRENT_PROJECTS_MIN = 30;
export const RETAINER_CURRENT_PROJECTS_MAX = 2000;
export const RETAINER_NEEDS_MIN = 30;
export const RETAINER_NEEDS_MAX = 2000;

/** Optional, so it only carries a ceiling — the floor would reject a one-word name. */
export const RETAINER_COMPANY_MAX = 120;

export const RETAINER_NOTES_MAX = 2000;

/**
 * The ceiling the `retainers.monthly_fee_usd` column can actually hold: it is
 * `numeric(10, 2)`, so eight digits before the point. The agreement is money, so
 * the schema agrees with the column rather than inventing a product ceiling —
 * and it rejects sub-cent precision instead of letting Postgres round silently.
 */
export const RETAINER_MONTHLY_FEE_MAX = 99_999_999.99;

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Shape and calendar validity, but no window: `paid_through` is legitimately in the past. */
function isIsoDate(value: string): boolean {
  if (!ISO_DATE_PATTERN.test(value)) return false;
  // `Date.parse` rolls out-of-range days over (2026-02-30 becomes March 2), so the
  // only trustworthy check is whether the date survives a round trip. Postgres
  // would otherwise reject the value and the Admin would see a 500, not a 400.
  const parsed = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function hasAtMostTwoDecimals(value: number): boolean {
  return Math.round(value * 100) / 100 === value;
}

// ------------------------------------------------------------
// Entity
// ------------------------------------------------------------

export interface Retainer {
  id: string;
  full_name: string;
  phone_whatsapp: string;
  email: string | null;
  company: string | null;
  /** The projects the Client already runs — the scope the retainer would cover. */
  current_projects: string;
  /** What they want maintained, fixed, improved or managed. */
  needs: string;
  preferred_start: string | null;
  /** The agreed terms, defaulted to the advertised figure. Never a charge. */
  monthly_fee_usd: number;
  /** Offline-collection bookkeeping, recorded by the Admin. */
  paid_through: string | null;
  reference_code: string;
  status: RetainerStatus;
  notes: string | null;
  /** Opportunistic attribution; NULL for the anonymous visitor, which is the norm. */
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

// ------------------------------------------------------------
// Validation schema
// ------------------------------------------------------------

export const RetainerSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, 'الاسم يجب أن يكون حرفين على الأقل')
    .max(120, 'الاسم طويل جدًّا'),
  phone_whatsapp: z.string().trim().regex(whatsappPhoneRegex, 'رقم واتساب غير صحيح'),
  email: z
    .string()
    .trim()
    .max(200, 'البريد الإلكتروني طويل جدًّا')
    .optional()
    .refine((value) => !value || z.email().safeParse(value).success, 'البريد الإلكتروني غير صحيح'),
  company: z.string().trim().max(RETAINER_COMPANY_MAX, 'اسم الشركة طويل جدًّا').optional(),
  current_projects: z
    .string()
    .trim()
    .min(
      RETAINER_CURRENT_PROJECTS_MIN,
      `اذكر المشاريع التي لديك بما لا يقل عن ${RETAINER_CURRENT_PROJECTS_MIN} حرفًا`
    )
    .max(
      RETAINER_CURRENT_PROJECTS_MAX,
      `وصف المشاريع طويل جدًّا (${RETAINER_CURRENT_PROJECTS_MAX.toLocaleString('en-US')} حرف كحد أقصى)`
    ),
  needs: z
    .string()
    .trim()
    .min(RETAINER_NEEDS_MIN, `اشرح ما تحتاج صيانته بما لا يقل عن ${RETAINER_NEEDS_MIN} حرفًا`)
    .max(
      RETAINER_NEEDS_MAX,
      `وصف الاحتياجات طويل جدًّا (${RETAINER_NEEDS_MAX.toLocaleString('en-US')} حرف كحد أقصى)`
    ),
  preferred_start: z
    .string()
    .trim()
    .optional()
    .refine((value) => !value || isIsoDate(value), 'تاريخ غير صحيح'),
});

export type RetainerInput = z.infer<typeof RetainerSchema>;

// ------------------------------------------------------------
// Admin record
// ------------------------------------------------------------

/**
 * What an Admin may change on a retainer: the lifecycle state, the agreed terms
 * and the offline-collection bookkeeping. The visitor's own answers are never
 * editable — a retainer is a record of what was submitted.
 *
 * Every field is optional, and **absence means "leave the stored value alone"**
 * rather than "clear it". Two reasons: the fee is `not null`, so clearing it
 * would fall back to the advertised figure and lose the agreement; and
 * `paid_through` records money already collected. The Admin UI sends only the
 * fields it actually changed, which is what makes a stale screen harmless — it
 * cannot revert a colleague's agreed fee or recorded payment. Pass an explicit
 * `null` to clear `notes` or `paid_through`.
 */
export const RetainerUpdateSchema = z.object({
  status: z.enum(RETAINER_STATUSES, 'حالة غير معروفة').optional(),
  notes: z.string().trim().max(RETAINER_NOTES_MAX, 'الملاحظات طويلة جدًّا').optional().nullable(),
  monthly_fee_usd: z.coerce
    .number('الرَّسم الشَّهريّ غير صحيح')
    .positive('الرَّسم الشَّهريّ يجب أن يكون أكبر من صفر')
    .max(RETAINER_MONTHLY_FEE_MAX, 'الرَّسم الشَّهريّ كبير جدًّا')
    .refine(hasAtMostTwoDecimals, 'الرَّسم الشَّهريّ لا يقبل أكثر من منزلتين عشريّتين')
    .optional(),
  paid_through: z
    .string()
    .trim()
    .optional()
    .nullable()
    .refine((value) => !value || isIsoDate(value), 'تاريخ غير صحيح'),
});

export type RetainerUpdateInput = z.infer<typeof RetainerUpdateSchema>;
