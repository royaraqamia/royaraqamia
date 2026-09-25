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
    'التَّدريب Online من خلال Google Meet\n' +
    'شروط الانضمام: توفُّر اللابتوب والإنترنت',
  trainer: 'م. أيْهَم العَلي',
  duration: '18-24 ساعة',
  sessions: '12-16 جلسة',
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
  notes: string | null;
  user_id: string | null;
  created_at: string;
  updated_at: string;
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
});

export type TrainingApplicationInput = z.infer<typeof TrainingApplicationSchema>;

export const TrainingApplicationUpdateSchema = z.object({
  status: z.enum(TRAINING_APPLICATION_STATUSES, 'حالة غير معروفة'),
  notes: z.string().trim().max(2000, 'الملاحظات طويلة جدًّا').optional().nullable(),
});

export type TrainingApplicationUpdateInput = z.infer<typeof TrainingApplicationUpdateSchema>;
