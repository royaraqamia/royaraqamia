import type {
  CodingFailureCode,
  CodingStepKind,
  CodingStepStatus,
  CodingTaskMode,
  CodingTaskStatus,
} from '@/shared/contracts/coding-agent';

/**
 * The document's one word for each wire state (ADR-0219). The status itself is
 * never painted as a machine token: a member reads Arabic and the caps and
 * dates stay in ASCII digits.
 */
export const CODING_TASK_STATUS_LABELS: Record<CodingTaskStatus, string> = {
  queued: 'في الانتظار',
  running: 'جاري التنفيذ',
  awaiting_plan: 'بانتظار الموافقة على الخطة',
  awaiting_push: 'بانتظار الموافقة على النشر',
  completed: 'مكتملة',
  failed: 'فاشلة',
  cancelled: 'ملغاة',
};

export const CODING_STEP_STATUS_LABELS: Record<CodingStepStatus, string> = {
  proposed: 'مقترح',
  running: 'جاري التنفيذ',
  applied: 'مطبَّق',
  rejected: 'مرفوض',
  failed: 'فاشل',
};

export const CODING_MODE_LABELS: Record<CodingTaskMode, string> = {
  plan: 'خطة',
  edit: 'تحرير',
  full: 'تلقائي',
};

export const CODING_STEP_KIND_LABELS: Record<CodingStepKind, string> = {
  plan: 'خطة',
  edit: 'تعديل',
  test: 'فحص',
  commit: 'حفظ',
  push: 'نشر',
  pull_request: 'طلب دمج',
  review: 'مراجعة الفرق',
};

export const CODING_FAILURE_LABELS: Record<CodingFailureCode, string> = {
  plan_rejected: 'رُفضت الخطة',
  push_rejected: 'رُفض نشر التغييرات',
  budget_exhausted: 'نفد الحد المسموح به',
  runner_timeout: 'انتهت مهلة التنفيذ',
  runner_failed: 'تعذّر تشغيل المهام',
  checks_failed: 'أخفقت الفحوصات',
  repo_unavailable: 'المستودع غير متاح',
};

/** The four states a task can still move in; those are the ones worth polling. */
export const ACTIVE_CODING_TASK_STATUSES: readonly CodingTaskStatus[] = [
  'queued',
  'running',
  'awaiting_plan',
  'awaiting_push',
];

export function isCodingTaskActive(status: CodingTaskStatus): boolean {
  return ACTIVE_CODING_TASK_STATUSES.includes(status);
}

/** Arabic month names, Latin digits — passes the repo's digit gate. */
export function formatCodingDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(date);
}

/** A pairing code expires within the hour, so the screen shows the clock. */
export function formatCodingTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ar-SA-u-nu-latn', {
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function formatCodingCount(value: number | null | undefined): string {
  return new Intl.NumberFormat('en-US').format(value ?? 0);
}
