import { z } from 'zod';
import { whatsappPhoneRegex } from './phone';

// ------------------------------------------------------------
// Enums & primitives
// ------------------------------------------------------------

export const CONSULTATION_BOOKING_STATUSES = [
  'pending',
  'confirmed',
  'rejected',
  'cancelled',
] as const;
export type ConsultationBookingStatus = (typeof CONSULTATION_BOOKING_STATUSES)[number];

export const CONSULTATION_BOOKING_STATUS_LABELS: Record<ConsultationBookingStatus, string> = {
  pending: 'قيد المراجعة',
  confirmed: 'مؤكّد',
  rejected: 'مرفوض',
  cancelled: 'ملغى',
};

/** Statuses that hold their slots (mirrored onto `consultation_booking_slots.is_active`). */
export const ACTIVE_BOOKING_STATUSES: readonly ConsultationBookingStatus[] = [
  'pending',
  'confirmed',
];

/** Reference codes are quoted in the WhatsApp handoff — `CONS-2026-A7K2M9QX`. */
export const CONSULTATION_REFERENCE_CODE_REGEX = /^CONS-\d{4}-[A-Z0-9]{8}$/;

// ------------------------------------------------------------
// Entities
// ------------------------------------------------------------

export interface ConsultationPackage {
  id: string;
  name: string;
  description: string | null;
  price_usd: number;
  duration_minutes: number;
  sessions_count: number;
  is_active: boolean;
  sort_order: number;
}

export interface AvailabilitySlot {
  id: string;
  starts_at: string;
  ends_at: string;
}

export interface ConsultationBooking {
  id: string;
  reference_code: string;
  /** Opportunistic attribution; NULL for the anonymous booker, which is the norm. */
  user_id: string | null;
  package_id: string;
  package_name?: string | null;
  full_name: string;
  phone_whatsapp: string;
  email: string | null;
  topic_description: string;
  status: ConsultationBookingStatus;
  confirmed_at: string | null;
  rejected_reason: string | null;
  created_at: string;
  updated_at: string;
  /** Session times attached to this booking (UTC instants). */
  sessions: AvailabilitySlot[];
}

// ------------------------------------------------------------
// Validation schemas
// ------------------------------------------------------------

export const BookingContactSchema = z.object({
  full_name: z
    .string()
    .trim()
    .min(2, 'الاسم يجب أن يكون حرفين على الأقل')
    .max(120, 'الاسم طويل جدًّا'),
  phone_whatsapp: z.string().trim().regex(whatsappPhoneRegex, 'رقم واتساب غير صحيح'),
  topic_description: z
    .string()
    .trim()
    .min(10, 'اشرح موضوع الاستشارة بما لا يقل عن 10 أحرف')
    .max(2000, 'الوصف طويل جدًّا (2,000 حرف كحد أقصى)'),
});

export const CreateBookingSchema = BookingContactSchema.extend({
  package_id: z.string().uuid('الباقة غير صحيحة'),
  slot_ids: z.array(z.string().uuid()).min(1, 'اختر موعدًا واحدًا على الأقل'),
});

export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;

// Admin-facing schemas -------------------------------------------------------

export const PackageUpsertSchema = z.object({
  name: z.string().trim().min(2, 'اسم الباقة مطلوب').max(160),
  description: z.string().trim().max(1000).optional().nullable(),
  price_usd: z.coerce.number().positive('السِّعر يجب أن يكون أكبر من صفر').max(100000),
  duration_minutes: z.coerce.number().int().min(15).max(480),
  sessions_count: z.coerce.number().int().min(1).max(20).default(1),
  is_active: z.boolean().default(true),
  sort_order: z.coerce.number().int().default(0),
});
export type PackageUpsertInput = z.infer<typeof PackageUpsertSchema>;

export const SlotCreateSchema = z
  .object({
    starts_at: z.string().datetime({ offset: true }),
    ends_at: z.string().datetime({ offset: true }),
  })
  .refine((v) => new Date(v.ends_at).getTime() > new Date(v.starts_at).getTime(), {
    message: 'وقت النِّهاية يجب أن يكون بعد وقت البداية',
    path: ['ends_at'],
  });
export type SlotCreateInput = z.infer<typeof SlotCreateSchema>;

export const BookingActionSchema = z.object({
  action: z.literal('confirm').or(z.literal('reject')),
  rejected_reason: z.string().trim().max(500).optional(),
});

export const ConsultationSettingsSchema = z.object({
  booking_whatsapp_url: z
    .string()
    .trim()
    .url('رابط واتساب غير صحيح')
    .regex(
      /^https:\/\/(wa\.me|chat\.whatsapp\.com|api\.whatsapp\.com)\//,
      'يجب أن يكون رابط واتساب صالح'
    ),
});
export type ConsultationSettings = z.infer<typeof ConsultationSettingsSchema>;

export const SETTINGS_KEYS = ['booking_whatsapp_url'] as const;

// ------------------------------------------------------------
// Error mapping (RPC exception codes → Arabic copy)
// ------------------------------------------------------------

export const BOOKING_ERROR_MESSAGES: Record<string, string> = {
  PACKAGE_NOT_FOUND: 'الباقة المطلوبة غير متوفِّرة حاليًّا.',
  SLOT_COUNT_MISMATCH: 'عدد المواعيد المُختارة لا يُطابق الباقة.',
  SLOT_UNAVAILABLE: 'أحد المواعيد المُختارة لم يعد متاحًا، اختر مواعيد أخرى.',
  SLOT_TAKEN: 'نأسف، سبقك شخص آخر إلى أحد هذه المواعيد. اختر مواعيد جديدة.',
  BOOKING_NOT_PENDING: 'لا يُمكن تنفيذ الطَّلب على هذا الحجز في حالته الحاليَّة.',
};

export function toBookingErrorMessage(code: string): string {
  return BOOKING_ERROR_MESSAGES[code] ?? 'حدث خطأ غير مُتوقَّع. الرَّجاء المحاولة مرَّة أخرى.';
}

// ------------------------------------------------------------
// WhatsApp handoff (pure; formatting done by caller)
//
// The success screen opens a chat that already carries the reference code,
// so the operator reads the right row instead of restarting the conversation.
// ------------------------------------------------------------

export interface BookingWhatsappMessageInput {
  referenceCode: string;
  fullName: string;
  packageName: string;
  /** Preformatted session lines, e.g. "الأحد 13 ربيع الأول 1448 هـ — 5:00 م (دمشق)". */
  sessionLines: string[];
}

export function buildBookingWhatsappMessage(input: BookingWhatsappMessageInput): string {
  return [
    'السَّلام عليكم، أرغب بتأكيد طلب حجز استشارة.',
    '',
    `🧾 رقم الحجز: ${input.referenceCode}`,
    `👤 الاسم: ${input.fullName}`,
    `📦 الباقة: ${input.packageName}`,
    '',
    '🗓️ المواعيد:',
    ...input.sessionLines.map((line) => `• ${line}`),
  ].join('\n');
}
