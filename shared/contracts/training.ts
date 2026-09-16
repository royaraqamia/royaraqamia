import { z } from 'zod';
import { whatsappPhoneRegex } from './phone';

// ------------------------------------------------------------
// The training programme
//
// One course, one offering. Both the homepage card (frontend/ui/TrainingCourses.tsx)
// and the application page read from here so the title, price and duration cannot
// drift apart. `course_slug` is stored on every application, so promoting this to a
// `courses` table later is additive — the slug is the stable key, not a foreign key.
// ------------------------------------------------------------

export const COURSE_SLUGS = ['build-digital-products'] as const;
export type CourseSlug = (typeof COURSE_SLUGS)[number];

export interface TrainingCourse {
  slug: CourseSlug;
  title: string;
  description: string;
  trainer: string;
  duration: string;
  sessions: string;
  price: string;
  /** Whether applications are currently being accepted. */
  isOpen: boolean;
}

export const TRAINING_COURSE: TrainingCourse = {
  slug: 'build-digital-products',
  title: 'بناء منتجات رقميَّة من الصِّفر',
  description:
    'نظام عمل متكامل: استخدم LLM Coding Agents لبناء مواقع وتطبيقات. أنت هنا المدير والأدوات هي فريق العمل.',
  trainer: 'م. أيْهَم العَلي',
  duration: '18 ساعة',
  sessions: '12 جلسة',
  price: '$50',
  isOpen: true,
};

// ------------------------------------------------------------
// Enums & labels
// ------------------------------------------------------------

export const TRAINING_EXPERIENCE_LEVELS = ['beginner', 'basic', 'experienced'] as const;
export type TrainingExperienceLevel = (typeof TRAINING_EXPERIENCE_LEVELS)[number];

export const TRAINING_EXPERIENCE_LABELS: Record<TrainingExperienceLevel, string> = {
  beginner: 'مبتدئ تمامًا',
  basic: 'لديّ خبرة بسيطة',
  experienced: 'لديّ خبرة جيّدة',
};

export const TRAINING_APPLICATION_STATUSES = ['new', 'contacted', 'enrolled', 'rejected'] as const;
export type TrainingApplicationStatus = (typeof TRAINING_APPLICATION_STATUSES)[number];

export const TRAINING_APPLICATION_STATUS_LABELS: Record<TrainingApplicationStatus, string> = {
  new: 'جديد',
  contacted: 'تمّ التواصل',
  enrolled: 'مُسجَّل',
  rejected: 'مرفوض',
};

/** Reference codes are quoted in the WhatsApp handoff — `TRN-2026-A7K2M9QX`. */
export const TRAINING_REFERENCE_CODE_REGEX = /^TRN-\d{4}-[A-Z0-9]{8}$/;

// ------------------------------------------------------------
// Entity
// ------------------------------------------------------------

export interface TrainingApplication {
  id: string;
  course_slug: string;
  full_name: string;
  phone_whatsapp: string;
  email: string | null;
  experience_level: TrainingExperienceLevel;
  goal: string | null;
  reference_code: string;
  status: TrainingApplicationStatus;
  notes: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

/** Trimmed inputs are stored as NULL rather than empty strings. */
export function toNullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

// ------------------------------------------------------------
// Validation schemas
// ------------------------------------------------------------

const optionalEmail = z.union([
  z.literal(''),
  z.string().trim().max(200, 'البريد الإلكتروني طويل جدًّا').email('البريد الإلكتروني غير صحيح'),
]);

export const TrainingApplicationSchema = z.object({
  course_slug: z.enum(COURSE_SLUGS, 'الدورة المطلوبة غير متوفِّرة'),
  full_name: z
    .string()
    .trim()
    .min(2, 'الاسم يجب أن يكون حرفين على الأقل')
    .max(120, 'الاسم طويل جدًّا'),
  phone_whatsapp: z.string().trim().regex(whatsappPhoneRegex, 'رقم واتساب غير صحيح'),
  email: optionalEmail.optional(),
  experience_level: z.enum(TRAINING_EXPERIENCE_LEVELS, 'اختر مستوى خبرتك'),
  goal: z.string().trim().max(1000, 'النصّ طويل جدًّا (1,000 حرف كحد أقصى)').optional(),
});

export type TrainingApplicationInput = z.infer<typeof TrainingApplicationSchema>;

export const TrainingApplicationUpdateSchema = z.object({
  status: z.enum(TRAINING_APPLICATION_STATUSES, 'حالة غير معروفة'),
  notes: z.string().trim().max(2000, 'الملاحظات طويلة جدًّا').optional().nullable(),
});

export type TrainingApplicationUpdateInput = z.infer<typeof TrainingApplicationUpdateSchema>;

// ------------------------------------------------------------
// WhatsApp handoff
//
// The success screen opens a chat that already carries the reference code, so the
// operator reads the right row instead of restarting the conversation.
// ------------------------------------------------------------

export interface ApplicationWhatsappMessageInput {
  referenceCode: string;
  fullName: string;
  courseTitle: string;
}

export function buildApplicationWhatsappMessage(input: ApplicationWhatsappMessageInput): string {
  return [
    'السَّلام عليكم، قدّمت طلب التحاق بالدورة.',
    '',
    `🧾 رقم الطلب: ${input.referenceCode}`,
    `👤 الاسم: ${input.fullName}`,
    `🎓 الدورة: ${input.courseTitle}`,
  ].join('\n');
}
