import { z } from 'zod';
import { whatsappPhoneRegex } from './phone';

// ------------------------------------------------------------
// Client Work — Project Request
//
// A prospective Client asks royaraqamia to build something and receives a
// Reference Code to quote. These are leads, not reservations: no account, no
// seat, nothing paid on the site (ADR-0005, ADR-0006). "Project" here means
// client work only — the showcase's items are Portfolio Items.
//
// A Project Request is an independent intake flow, not a CRM: the Client exists
// only as the contact fields on the lead, and there is no Client or Project
// table (ADR-0005).
// ------------------------------------------------------------

export const PROJECT_REQUEST_TYPES = ['website', 'app', 'other'] as const;
export type ProjectRequestType = (typeof PROJECT_REQUEST_TYPES)[number];

/** The labels the advertised tiers are sold under in the البناء section. */
export const PROJECT_REQUEST_TYPE_LABELS: Record<ProjectRequestType, string> = {
  website: 'موقع',
  app: 'تطبيق',
  other: 'أخرى',
};

/**
 * Budget brackets anchored on the advertised starting prices ($300 for a site,
 * $600 for an app), so a prospective Client signals a range instead of guessing
 * at a number. Stored as the stable key; the Admin list shows the label.
 */
export const PROJECT_REQUEST_BUDGET_RANGES = [
  'under-300',
  '300-600',
  '600-1500',
  'over-1500',
] as const;
export type ProjectRequestBudgetRange = (typeof PROJECT_REQUEST_BUDGET_RANGES)[number];

export const PROJECT_REQUEST_BUDGET_RANGE_LABELS: Record<ProjectRequestBudgetRange, string> = {
  'under-300': 'أقل من 300$',
  '300-600': '300$ – 600$',
  '600-1500': '600$ – 1,500$',
  'over-1500': 'أكثر من 1,500$',
};

export const PROJECT_REQUEST_TIMELINES = [
  'within-a-month',
  'one-to-three-months',
  'three-to-six-months',
  'flexible',
] as const;
export type ProjectRequestTimeline = (typeof PROJECT_REQUEST_TIMELINES)[number];

export const PROJECT_REQUEST_TIMELINE_LABELS: Record<ProjectRequestTimeline, string> = {
  'within-a-month': 'خلال شهر',
  'one-to-three-months': 'شهر – 3 أشهر',
  'three-to-six-months': '3 أشهر – 6 أشهر',
  flexible: 'مرن',
};

export const PROJECT_REQUEST_STATUSES = ['new', 'contacted', 'quoted', 'won', 'lost'] as const;
export type ProjectRequestStatus = (typeof PROJECT_REQUEST_STATUSES)[number];

export const PROJECT_REQUEST_STATUS_LABELS: Record<ProjectRequestStatus, string> = {
  new: 'جديد',
  contacted: 'تمّ التواصل',
  quoted: 'تمّ إرسال العرض',
  won: 'مكسوب',
  lost: 'خسارة',
};

/** Reference codes are quoted in the WhatsApp handoff — `PRJ-2026-A7K2M9QX`. */
export const PROJECT_REQUEST_REFERENCE_CODE_REGEX = /^PRJ-\d{4}-[A-Z0-9]{8}$/;

/**
 * Bounds for the project description, matching the Consultation topic bound.
 * The floor is an anti-junk guard, not a quality gate: the Admin triages the
 * submitted text.
 */
export const PROJECT_REQUEST_DESCRIPTION_MIN = 30;
export const PROJECT_REQUEST_DESCRIPTION_MAX = 2000;

// ------------------------------------------------------------
// Entity
// ------------------------------------------------------------

export interface ProjectRequest {
  id: string;
  full_name: string;
  phone_whatsapp: string;
  email: string | null;
  /** Constrained by the table's check constraint. */
  project_type: ProjectRequestType;
  description: string;
  /**
   * Chosen from a fixed set, but the column is unconstrained text, so the type
   * stays honest about what a row can actually hold.
   */
  budget_range: string | null;
  timeline: string | null;
  existing_url: string | null;
  reference_code: string;
  status: ProjectRequestStatus;
  notes: string | null;
  /** Opportunistic attribution; NULL for the anonymous visitor, which is the norm. */
  user_id: string | null;
  created_at: string;
  updated_at: string;
}

// ------------------------------------------------------------
// Validation schema
// ------------------------------------------------------------

export const ProjectRequestSchema = z.object({
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
  project_type: z.enum(PROJECT_REQUEST_TYPES, 'نوع المشروع غير صحيح'),
  description: z
    .string()
    .trim()
    .min(
      PROJECT_REQUEST_DESCRIPTION_MIN,
      `اشرح المشروع بما لا يقل عن ${PROJECT_REQUEST_DESCRIPTION_MIN} حرفًا`
    )
    .max(
      PROJECT_REQUEST_DESCRIPTION_MAX,
      `الوصف طويل جدًّا (${PROJECT_REQUEST_DESCRIPTION_MAX.toLocaleString('en-US')} حرف كحد أقصى)`
    ),
  budget_range: z.enum(PROJECT_REQUEST_BUDGET_RANGES, 'الميزانية غير صحيحة').optional(),
  timeline: z.enum(PROJECT_REQUEST_TIMELINES, 'المدة غير صحيحة').optional(),
  existing_url: z
    .string()
    .trim()
    .max(500, 'الرابط طويل جدًّا')
    .optional()
    .refine((value) => !value || z.url().safeParse(value).success, 'رابط غير صحيح'),
});

export type ProjectRequestInput = z.infer<typeof ProjectRequestSchema>;

// ------------------------------------------------------------
// Admin transition
// ------------------------------------------------------------

/**
 * What an Admin may change on a request: the sales state and the follow-up
 * notes. The visitor's own answers are never editable — a request is a record
 * of what was submitted, and the notes column is where the Admin's context
 * goes (who called, what was quoted). `notes: null` clears them.
 */
export const ProjectRequestUpdateSchema = z.object({
  status: z.enum(PROJECT_REQUEST_STATUSES, 'حالة غير معروفة'),
  notes: z.string().trim().max(2000, 'الملاحظات طويلة جدًّا').optional().nullable(),
});

export type ProjectRequestUpdateInput = z.infer<typeof ProjectRequestUpdateSchema>;
