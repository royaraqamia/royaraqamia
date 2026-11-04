import { z } from 'zod';
import { whatsappPhoneRegex } from './phone';

// ------------------------------------------------------------
// Subscription request
//
// «اشترِك الآن» used to open a WhatsApp chat with the founder. It now opens a
// form on the site: the reader picks the paid plan, leaves their details, and an
// Admin activates the plan from the console — the same offline agreement the
// pricing page has always described, with a row to quote instead of a chat
// transcript.
//
// It is a request, not a charge: nothing is paid on the site and no billing
// exists (ADR-0005, ADR-0006). The table is the record; `/admin/plans/requests`
// is where it is read.
// ------------------------------------------------------------

export const SUBSCRIPTION_REQUEST_STATUSES = ['new', 'contacted', 'activated', 'declined'] as const;
export type SubscriptionRequestStatus = (typeof SUBSCRIPTION_REQUEST_STATUSES)[number];

export const SUBSCRIPTION_REQUEST_STATUS_LABELS: Record<SubscriptionRequestStatus, string> = {
  new: 'جديد',
  contacted: 'تمّ التواصل',
  activated: 'مُفعَّل',
  declined: 'غير مكتمل',
};

/** Reference codes are quoted back over WhatsApp — `SUB-2026-A7K2M9QX`. */
export const SUBSCRIPTION_REFERENCE_CODE_PREFIX = 'SUB';
export const SUBSCRIPTION_REFERENCE_CODE_REGEX = /^SUB-\d{4}-[A-Z0-9]{8}$/;

/** The only plan this form sells; the free plan needs no request. */
export const SUBSCRIPTION_PLAN = 'pro' as const;
export type SubscriptionPlan = typeof SUBSCRIPTION_PLAN;

export const SUBSCRIPTION_NAME_MAX = 120;
export const SUBSCRIPTION_EMAIL_MAX = 200;
export const SUBSCRIPTION_NOTE_MAX = 1000;

// ------------------------------------------------------------
// Entity
// ------------------------------------------------------------

export interface SubscriptionRequest {
  id: string;
  /** The account the plan would be activated on. Required: a plan is a member's. */
  user_id: string;
  plan: SubscriptionPlan;
  full_name: string;
  phone_whatsapp: string;
  email: string | null;
  /** What the reader runs, so the Admin can answer with a relevant pitch. */
  note: string | null;
  reference_code: string;
  status: SubscriptionRequestStatus;
  /** Admin-only bookkeeping; never submitted by the reader. */
  notes: string | null;
  created_at: string;
  updated_at: string;
}

// ------------------------------------------------------------
// Validation
// ------------------------------------------------------------

/**
 * What the reader fills in. Nothing here names a price or a plan: the plan is
 * the page's constant and the price is read from the catalogue at render time,
 * so a stale form cannot promise a figure the server does not charge.
 *
 * `client_id` is the Outbox's client-minted idempotency key (ADR-0029, ticket
 * #169): a submission queued offline and replayed must not create two rows.
 */
export const SubscriptionRequestSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, 'الاسم يجب أن يكون حرفين على الأقل')
    .max(SUBSCRIPTION_NAME_MAX, 'الاسم طويل جدًّا'),
  phone_whatsapp: z.string().trim().regex(whatsappPhoneRegex, 'رقم واتساب غير صحيح'),
  email: z
    .string()
    .trim()
    .max(SUBSCRIPTION_EMAIL_MAX, 'البريد الإلكتروني طويل جدًّا')
    .optional()
    .refine((value) => !value || z.email().safeParse(value).success, 'البريد الإلكتروني غير صحيح'),
  note: z.string().trim().max(SUBSCRIPTION_NOTE_MAX, 'الملاحظة طويلة جدًّا').optional(),
  client_id: z.string().uuid('مُعرَّف الطَّلب غير صحيح').optional(),
});

export type SubscriptionRequestInput = z.infer<typeof SubscriptionRequestSchema>;

/**
 * The Admin's edit. Every field is optional and absent means "leave it alone":
 * the reader's answers are a record of what was submitted, so they are not
 * editable here at all — only the lifecycle state and the Admin's notes are.
 */
export const SubscriptionRequestUpdateSchema = z.object({
  status: z.enum(SUBSCRIPTION_REQUEST_STATUSES, 'حالة غير معروفة').optional(),
  notes: z.string().trim().max(2000, 'الملاحظات طويلة جدًّا').optional().nullable(),
});

export type SubscriptionRequestUpdateInput = z.infer<typeof SubscriptionRequestUpdateSchema>;
