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
  title: 'تطوير وإدارة المنتجات الرَّقميَّة',
  description:
    'حوِّل فكرتك إلى تطبيق جاهز للإطلاق والبيع!\n' +
    '\n' +
    'برنامج تدريبي متكامل يُرافقك خطوة بخطوة عبر جميع مراحل بناء المنتج: من اكتساب الرُّؤية التَّحليليَّة (Business) والفِكر التَّصميمي (UX)، إلى التَّنفيذ البرمجي بالـ AI (كـ Engineer) باستخدام أحدث الأدوات مثل الـ AI Skills والـ MCPs، وختامًا بقواعد التَّسويق الأساسيَّة لضمان الانتشار.\n' +
    'اختصِر سنوات من التَّجربة وعشرات الدَّورات في مسار عملي ومُوجَز يُواكب متطلَّبات العصر.\n' +
    '\n' +
    'التَّدريب Online.\n' +
    'شروط الانضمام: توفُّر الإنترنت واللابتوب وخلفيَّة تقنيَّة.',
  trainer: 'م. أيْهَم العَلي',
  duration: '18 ساعة',
  sessions: '12 جلسة',
  price: '$50',
  isOpen: true,
};

// ------------------------------------------------------------
// Enums & labels
// ------------------------------------------------------------

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
// Cohorts
//
// A dated intake: a fixed start date and a fixed number of seats. Seats are the
// only scarce resource in the training offering. Applying to a Cohort reserves
// nothing; an operator enrolls an Application into it, claiming a seat
// (ADR-0008).
// ------------------------------------------------------------

export const TRAINING_COHORT_STATUSES = ['open', 'closed'] as const;
export type TrainingCohortStatus = (typeof TRAINING_COHORT_STATUSES)[number];

export const TRAINING_COHORT_STATUS_LABELS: Record<TrainingCohortStatus, string> = {
  open: 'مفتوحة',
  closed: 'مُغلَقة',
};

/** The default seat count for a new Cohort, and the ceiling the form enforces. */
export const TRAINING_COHORT_DEFAULT_CAPACITY = 10;
export const TRAINING_COHORT_CAPACITY_MAX = 100;

/** Bound for the operator-facing Cohort label, e.g. "الدُّفعة الثَّانية — نوفمبر". */
export const TRAINING_COHORT_LABEL_MAX = 120;
export const TRAINING_COHORT_NOTES_MAX = 2000;

export interface TrainingCohort {
  id: string;
  course_slug: string;
  label: string;
  starts_at: string;
  capacity: number;
  seats_taken: number;
  status: TrainingCohortStatus;
  created_at: string;
  updated_at: string;
}

/** Seats still available in a Cohort. Never negative, even if a counter drifts. */
export function trainingCohortSeatsLeft(cohort: Pick<TrainingCohort, 'capacity' | 'seats_taken'>) {
  return Math.max(cohort.capacity - cohort.seats_taken, 0);
}

export const TrainingCohortCreateSchema = z.object({
  course_slug: z.enum(COURSE_SLUGS, 'الدورة المطلوبة غير متوفِّرة'),
  label: z
    .string()
    .trim()
    .min(2, 'العنوان يجب أن يكون حرفين على الأقل')
    .max(TRAINING_COHORT_LABEL_MAX, 'العنوان طويل جدًّا'),
  starts_at: z.string().trim().min(1, 'تاريخ البدء مطلوب'),
  capacity: z.coerce
    .number()
    .int('عدد المقاعد يجب أن يكون رقمًا صحيحًا')
    .min(1, 'عدد المقاعد يجب أن يكون مقعدًا واحدًا على الأقل')
    .max(TRAINING_COHORT_CAPACITY_MAX, 'عدد المقاعد كبير جدًّا'),
  status: z.enum(TRAINING_COHORT_STATUSES).optional().default('open'),
});

export type TrainingCohortCreateInput = z.infer<typeof TrainingCohortCreateSchema>;

export const TrainingCohortUpdateSchema = z.object({
  label: z
    .string()
    .trim()
    .min(2, 'العنوان يجب أن يكون حرفين على الأقل')
    .max(TRAINING_COHORT_LABEL_MAX, 'العنوان طويل جدًّا')
    .optional(),
  starts_at: z.string().trim().min(1, 'تاريخ البدء مطلوب').optional(),
  capacity: z.coerce
    .number()
    .int('عدد المقاعد يجب أن يكون رقمًا صحيحًا')
    .min(1, 'عدد المقاعد يجب أن يكون مقعدًا واحدًا على الأقل')
    .max(TRAINING_COHORT_CAPACITY_MAX, 'عدد المقاعد كبير جدًّا')
    .optional(),
  status: z.enum(TRAINING_COHORT_STATUSES, 'حالة غير معروفة').optional(),
});

export type TrainingCohortUpdateInput = z.infer<typeof TrainingCohortUpdateSchema>;

// ------------------------------------------------------------
// Entity
// ------------------------------------------------------------

export interface TrainingApplication {
  id: string;
  course_slug: string;
  full_name: string;
  phone_whatsapp: string;
  goal: string | null;
  reference_code: string;
  status: TrainingApplicationStatus;
  /** The Cohort holding this Application's seat; null until enrolled. */
  cohort_id: string | null;
  notes: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
  /** Last submitter edit; NULL until the applicant corrects their application. */
  edited_at: string | null;
}

// ------------------------------------------------------------
// Validation schemas
// ------------------------------------------------------------

export const TrainingApplicationSchema = z.object({
  course_slug: z.enum(COURSE_SLUGS, 'الدورة المطلوبة غير متوفِّرة'),
  full_name: z
    .string()
    .trim()
    .min(2, 'الاسم يجب أن يكون حرفين على الأقل')
    .max(120, 'الاسم طويل جدًّا'),
  phone_whatsapp: z.string().trim().regex(whatsappPhoneRegex, 'رقم واتساب غير صحيح'),
  goal: z.string().trim().max(1000, 'النصّ طويل جدًّا (1,000 حرف كحد أقصى)').optional(),
  /**
   * The Cohort the applicant wants. Required: the apply form must not let a
   * student advance without choosing one, even when no Cohort is open yet.
   */
  cohort_id: z
    .string('الرَّجاء اختيار الدُّفعة')
    .min(1, 'الرَّجاء اختيار الدُّفعة')
    .uuid('الدُّفعة المختارة غير صحيحة'),
});

export type TrainingApplicationInput = z.infer<typeof TrainingApplicationSchema>;

/**
 * What a signed-in applicant may change on their own application. `cohort_id`
 * is accepted only while the application holds no seat: once enrolled, the
 * cohort is a claimed reservation and a change must go through release-then-
 * enroll (ADR-0008), which the service enforces. The status, notes, reference
 * code and attribution are never accepted here.
 */
export const TrainingApplicationEditSchema = TrainingApplicationSchema;

export type TrainingApplicationEditInput = z.infer<typeof TrainingApplicationEditSchema>;

/**
 * Statuses an application may be moved to through the plain update path.
 *
 * `enrolled` is deliberately absent: enrolling claims a scarce seat, so it must
 * go through the capacity-guarded `enroll` RPC, never a status write (ADR-0008).
 * Leaving `enrolled` is likewise the `release` path, which gives the seat back.
 */
export const TRAINING_MANUAL_STATUSES = ['new', 'contacted', 'rejected'] as const;
export type TrainingManualStatus = (typeof TRAINING_MANUAL_STATUSES)[number];

export const TrainingApplicationUpdateSchema = z.object({
  status: z.enum(TRAINING_MANUAL_STATUSES, 'حالة غير معروفة'),
  notes: z.string().trim().max(2000, 'الملاحظات طويلة جدًّا').optional().nullable(),
});

export type TrainingApplicationUpdateInput = z.infer<typeof TrainingApplicationUpdateSchema>;

/** Targets an enrolled Application can be released to (it can never go back to `enrolled`). */
export const TRAINING_RELEASE_TARGET_STATUSES = ['new', 'contacted', 'rejected'] as const;
export type TrainingReleaseTargetStatus = (typeof TRAINING_RELEASE_TARGET_STATUSES)[number];

export const TrainingApplicationEnrollSchema = z.object({
  cohort_id: z.string().uuid('الدُّفعة غير صحيحة'),
});

export type TrainingApplicationEnrollInput = z.infer<typeof TrainingApplicationEnrollSchema>;

export const TrainingApplicationReleaseSchema = z.object({
  status: z.enum(TRAINING_RELEASE_TARGET_STATUSES, 'حالة غير معروفة'),
  notes: z.string().trim().max(2000, 'الملاحظات طويلة جدًّا').optional().nullable(),
});

export type TrainingApplicationReleaseInput = z.infer<typeof TrainingApplicationReleaseSchema>;
