import { z } from 'zod';

// ------------------------------------------------------------
// Enums & primitives
// ------------------------------------------------------------

export const CONSULTATION_REGIONS = ['syria', 'global'] as const;
export type ConsultationRegion = (typeof CONSULTATION_REGIONS)[number];

export const CONSULTATION_PAYMENT_METHODS = ['shamcash', 'moneygram'] as const;
export type ConsultationPaymentMethod = (typeof CONSULTATION_PAYMENT_METHODS)[number];

export const CONSULTATION_BOOKING_STATUSES = [
  'pending_payment',
  'awaiting_review',
  'confirmed',
  'rejected',
  'cancelled',
  'expired',
] as const;
export type ConsultationBookingStatus = (typeof CONSULTATION_BOOKING_STATUSES)[number];

/** Statuses that hold their slots (mirrored onto `consultation_booking_slots.is_active`). */
export const ACTIVE_BOOKING_STATUSES: readonly ConsultationBookingStatus[] = [
  'pending_payment',
  'awaiting_review',
  'confirmed',
];

/** Statuses the booker may still act on. */
export const USER_CANCELLABLE_STATUSES: readonly ConsultationBookingStatus[] = [
  'pending_payment',
  'awaiting_review',
];

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
  user_id: string;
  package_id: string;
  package_name?: string | null;
  full_name: string;
  phone_whatsapp: string;
  email: string;
  topic_description: string;
  region: ConsultationRegion;
  payment_method: ConsultationPaymentMethod;
  amount_due_usd: number;
  status: ConsultationBookingStatus;
  expires_at: string;
  receipt_sent_at: string | null;
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

const whatsappPhoneRegex = /^[+]?[\d\s-]{7,20}$/;

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
  region: z.enum(CONSULTATION_REGIONS),
  payment_method: z.enum(CONSULTATION_PAYMENT_METHODS),
});

export type CreateBookingInput = z.infer<typeof CreateBookingSchema>;

export const RegionSelectionSchema = z.object({
  region: z.enum(CONSULTATION_REGIONS),
  payment_method: z.enum(CONSULTATION_PAYMENT_METHODS),
});
export type RegionSelection = z.infer<typeof RegionSelectionSchema>;

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
  payment_shamcash_code: z.string().trim().min(4, 'رمز ShamCash قصير جدًّا').max(64),
  payment_moneygram_name: z.string().trim().min(2, 'الاسم مطلوب').max(160),
  payment_moneygram_phone: z.string().trim().regex(whatsappPhoneRegex, 'رقم هاتف غير صحيح'),
  payment_moneygram_branch: z.string().trim().min(2, 'الفرع مطلوب').max(200),
});
export type ConsultationSettings = z.infer<typeof ConsultationSettingsSchema>;

export const SETTINGS_KEYS = [
  'booking_whatsapp_url',
  'payment_shamcash_code',
  'payment_moneygram_name',
  'payment_moneygram_phone',
  'payment_moneygram_branch',
] as const;

// ------------------------------------------------------------
// Error mapping (RPC exception codes → Arabic copy)
// ------------------------------------------------------------

export const BOOKING_ERROR_MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'يجب تسجيل الدُّخول أوَّلًا.',
  PACKAGE_NOT_FOUND: 'الباقة المطلوبة غير متوفِّرة حاليًّا.',
  SLOT_COUNT_MISMATCH: 'عدد المواعيد المُختارة لا يُطابق الباقة.',
  SLOT_UNAVAILABLE: 'أحد المواعيد المُختارة لم يعد متاحًا، اختر مواعيد أخرى.',
  SLOT_TAKEN: 'نأسف، سبقك شخص آخر إلى أحد هذه المواعيد. اختر مواعيد جديدة.',
  BOOKING_NOT_PENDING: 'لا يُمكن تنفيذ الطَّلب على هذا الحجز في حالته الحاليَّة.',
  BOOKING_NOT_CANCELLABLE: 'لا يُمكن إلغاء هذا الحجز في حالته الحاليَّة.',
};

export function toBookingErrorMessage(code: string): string {
  return BOOKING_ERROR_MESSAGES[code] ?? 'حدث خطأ غير مُتوقَّع. الرَّجاء المحاولة مرَّة أخرى.';
}

// ------------------------------------------------------------
// WhatsApp receipt message builder (pure; formatting done by caller)
// ------------------------------------------------------------

export interface ReceiptMessageInput {
  bookingRef: string;
  full_name: string;
  email: string;
  phone_whatsapp: string;
  packageName: string;
  amountDueUsd: number;
  paymentMethodLabel: string;
  /** Preformatted session lines, e.g. "الأحد 13 ربيع الأول 1448 هـ — 5:00 م (دمشق)". */
  sessionLines: string[];
}

export function buildReceiptWhatsappMessage(input: ReceiptMessageInput): string {
  return [
    'السَّلام عليكم، أرغب بتأكيد حجز استشارة.',
    '',
    `🧾 رقم الحجز: ${input.bookingRef}`,
    `👤 الاسم: ${input.full_name}`,
    `📧 البريد الإلكتروني: ${input.email}`,
    `📱 واتساب: ${input.phone_whatsapp}`,
    `📦 الباقة: ${input.packageName}`,
    `💰 المبلغ المدفوع: $${input.amountDueUsd}`,
    `💳 طريقة الدَّفع: ${input.paymentMethodLabel}`,
    '',
    '🗓️ المواعيد:',
    ...input.sessionLines.map((line) => `• ${line}`),
    '',
    'مُرفَق لكم صورة الإيصال 📎',
  ].join('\n');
}

export const PAYMENT_METHOD_LABELS: Record<ConsultationPaymentMethod, string> = {
  shamcash: 'ShamCash',
  moneygram: 'MoneyGram',
};

export const REGION_LABELS: Record<ConsultationRegion, string> = {
  syria: 'داخل سوريا',
  global: 'خارج سوريا',
};
