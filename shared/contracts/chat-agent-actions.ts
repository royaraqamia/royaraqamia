/**
 * What the assistant proposed, and how the thread words it (ADR-0113, #818).
 *
 * The row is written by the server and resolved by the member's own request;
 * both clients draw it, so the words live here rather than in either of them
 * (ADR-0098's reasoning, one layer before the app port of #819).
 */

import { z } from 'zod';

export const CHAT_AGENT_ACTION_STATUSES = [
  'proposed',
  'confirmed',
  'rejected',
  'applied',
  'failed',
] as const;

export type ChatAgentActionStatus = (typeof CHAT_AGENT_ACTION_STATUSES)[number];

/**
 * The wire shapes (#1182). The row above is what the site's services pass around;
 * these are the same fields as a schema, so the app decodes one contract instead
 * of retyping its names in Kotlin (ADR-0098). `args` carries whatever the tool
 * accepted, so it is an open object — the app reads the sentence the server
 * already wrote into the message rather than re-deriving it from the arguments.
 */
export const ChatAgentActionStatusSchema = z.enum(CHAT_AGENT_ACTION_STATUSES);

/**
 * An object whose keys belong to the tool that was proposed, not to this card.
 * The one optional field keeps the generated Kotlin class constructible; every
 * other key is read by the site and ignored by the app, which draws the sentence
 * the server already wrote into the message.
 */
const OpaqueArgumentsSchema = z.object({ opaque: z.string().optional() }).passthrough();

export const ChatAgentActionSchema = z.object({
  id: z.string(),
  conversationId: z.string(),
  messageId: z.string(),
  tool: z.string(),
  args: OpaqueArgumentsSchema,
  appName: z.string().nullable().optional(),
  status: ChatAgentActionStatusSchema,
  result: z.object({ error: z.string().optional() }).passthrough().nullable(),
  createdAt: z.string(),
  resolvedAt: z.string().nullable(),
  resolvedBy: z.string().nullable(),
});

/** The answer to a confirm or a reject: the settled row, or the refusal. */
export const ChatAgentActionResponseSchema = z.object({
  success: z.boolean(),
  action: ChatAgentActionSchema.optional(),
  error: z.string().optional(),
});

/** The audit row: which tool, which arguments, who resolved it, what it answered. */
export interface ChatAgentAction {
  id: string;
  conversationId: string;
  /** The assistant's line the proposal is drawn under. */
  messageId: string;
  /**
   * The tool: a name from `CHAT_AGENT_TOOL_NAMES`, or `app:<connectionId>:<tool>`
   * for a tool of an app we do not own (ADR-0155, decision 11).
   */
  tool: string;
  args: Record<string, unknown>;
  /**
   * The app a remote tool belongs to, as the member named it.
   *
   * Resolved when the card is read, not when it is written, so a rename updates
   * the history and a disconnected app leaves a card that still reads. `null`
   * means the connection is gone; a first-party tool has no app at all.
   */
  appName?: string | null;
  status: ChatAgentActionStatus;
  /** The service's answer for an applied action, or the reason it was refused. */
  result: Record<string, unknown> | null;
  createdAt: string;
  resolvedAt: string | null;
  resolvedBy: string | null;
}

/** The tools the model may name. The server's registry owns the schemas. */
export const CHAT_AGENT_TOOL_NAMES = [
  'list_certificates',
  'get_certificate',
  'verify_certificate',
  'get_usage_state',
  'get_profile',
  'update_profile',
  'list_consultation_bookings',
  'list_consultation_options',
  // The member's own state in the other two intake products (issue #1434): the
  // application and its status, the cohorts a student may ask for, and the
  // project request and its status.
  'list_training_applications',
  'list_training_cohorts',
  'list_project_requests',
  'list_my_posts',
  'get_post_by_slug',
  'get_habits_summary',
  'get_expenses_summary',
  // The rest of HabitFlow's and SpendTrack's hands (issue #1432). The two
  // SpendTrack writes the turn already had keep their names: `record_expense`
  // and `edit_expense` are the `create_expense` and `update_expense` capabilities
  // at the registry, whose MCP names are frozen on the other door.
  'list_habits',
  'get_logs',
  'update_habit',
  'toggle_log',
  'delete_habit',
  'list_categories',
  'list_transactions',
  'get_summary',
  'list_budgets',
  'create_category',
  'set_budget',
  'delete_expense',
  // The two content reads (issue #1429): the day's digest and one story of it.
  // Public content, so nothing here depends on the member beyond the plan's
  // card allowance the board already applies.
  'get_latest_news',
  'get_news_item',
  // The rates board and the series it exposes, read through the same converter
  // the `/rates` page runs, so a number the assistant quotes is the page's.
  'get_rate',
  'get_rate_history',
  // The three content apps' reads (issue #1430): the Quran's text and its own
  // search index, the Athkar's two sets, and the summary a scan left behind.
  'list_surahs',
  'get_surah',
  'get_verse',
  'search_quran',
  'list_athkar_sets',
  'get_athkar',
  'get_scan_history',
  // The products' hands (issue #1431). LinkSnap's five operations reuse the MCP
  // handlers' structuredContent; Notes has no MCP door, so its five call the
  // product service. Deletes are tier 3 and name their target on the card.
  'list_links',
  'get_analytics',
  'create_link',
  'update_link',
  'delete_link',
  'list_notes',
  'get_note',
  'create_note',
  'update_note',
  'delete_note',
  'create_post_draft',
  'edit_post_draft',
  'publish_post_draft',
  // The rest of Community's hands (#1433): unpublishing, delete, the public
  // keyset thread, the member's own like row, and their own comments.
  'unpublish_post_draft',
  'delete_post',
  'list_post_comments',
  'set_post_like',
  'create_post_comment',
  'edit_post_comment',
  'delete_post_comment',
  'record_expense',
  'edit_expense',
  'create_habit',
  'set_habit_reminder',
  'book_consultation',
  'cancel_consultation',
  'apply_training',
  'submit_project_request',
  'change_display_name',
  // What the member asks to be remembered (ADR-0182 decision 2): a card until
  // they grant it, and the card is the consent decision 5 wants.
  'remember',
  'list_specialists',
  'load_specialist',
  // The web the assistant may read (ADR-0206). Declared only when the
  // deployment has a search key, so a turn with no search carries no
  // invitation to look for one.
  'search_web',
  // The recovery path for an app tool the router missed (ADR-0155, decision 7).
  // Declared only when the member has an enabled app, so a turn with no
  // connections carries no invitation to look for one.
  'find_app_tools',
  // The refresh for the eyes the turn already carries (ADR-0181, decision 7).
  // Declared only when the request brought a snapshot, so a client without eyes
  // carries no invitation to read a screen it does not have.
  'get_screen_context',
  // The Admin Console's hands (ADR-0180, decision 10, #1435). They are declared
  // only inside a verified admin's own turn, and the executor re-reads `isAdmin`
  // from the session before one runs. Member lookup carries the hidden
  // (blocked-from-listing) state; the two report tools are the review queue the
  // page already draws, and the decision is a tier-2 card.
  'admin_list_members',
  'admin_list_reports',
  'admin_decide_report',
] as const;

export type ChatAgentToolName = (typeof CHAT_AGENT_TOOL_NAMES)[number];

/**
 * The tools that require the `admin` scope (ADR-0180, decision 10). They are the
 * one family the registry marks, so the turn's declaration filter, the executor
 * and the card's visible admin mark read the same list rather than three prefix
 * checks.
 */
export const ADMIN_AGENT_TOOL_NAMES = [
  'admin_list_members',
  'admin_list_reports',
  'admin_decide_report',
] as const satisfies readonly ChatAgentToolName[];

/** Whether a tool is an admin capability, by the list above. */
export function chatAgentToolIsAdmin(tool: string): boolean {
  return (ADMIN_AGENT_TOOL_NAMES as readonly string[]).includes(tool);
}

/**
 * `read` runs inside the turn and its answer reaches the model. `write` never
 * runs there: it is drawn as a proposal and runs when the member confirms.
 */
export type ChatAgentToolKind = 'read' | 'write';

export interface ChatAgentToolInfo {
  kind: ChatAgentToolKind;
  /** What the card calls the tool, in the member's language. */
  label: string;
  /**
   * What the header says while the tool runs (ADR-0173): present tense, because
   * a phase line describes now. Arabic does not conjugate a gerund mechanically,
   * so the two forms are two strings, not one derived from the other.
   */
  activity: string;
}

export const CHAT_AGENT_TOOLS: Record<ChatAgentToolName, ChatAgentToolInfo> = {
  list_certificates: { kind: 'read', label: 'قراءة شهاداتك', activity: 'تقرأ شهاداتك' },
  get_certificate: { kind: 'read', label: 'قراءة شهادة', activity: 'تقرأ شهادة' },
  verify_certificate: { kind: 'read', label: 'التحقق من شهادة', activity: 'يتحقق من شهادة' },
  get_usage_state: {
    kind: 'read',
    label: 'قراءة خطتك واستخدامك',
    activity: 'تقرأ خطتك واستخدامك',
  },
  get_profile: { kind: 'read', label: 'قراءة ملفك الشخصي', activity: 'تقرأ ملفك الشخصي' },
  update_profile: { kind: 'write', label: 'تعديل ملفك الشخصي', activity: 'تعدّل ملفك الشخصي' },
  list_consultation_bookings: {
    kind: 'read',
    label: 'قراءة حجوزات الاستشارة',
    activity: 'تقرأ حجوزات الاستشارة',
  },
  list_consultation_options: {
    kind: 'read',
    label: 'قراءة باقات الاستشارة ومواعيدها',
    activity: 'تقرأ باقات الاستشارة ومواعيدها',
  },
  list_training_applications: {
    kind: 'read',
    label: 'قراءة طلبات التدريب',
    activity: 'تقرأ طلبات التدريب',
  },
  list_training_cohorts: {
    kind: 'read',
    label: 'قراءة الدُّفعات المفتوحة',
    activity: 'تقرأ الدُّفعات المفتوحة',
  },
  list_project_requests: {
    kind: 'read',
    label: 'قراءة طلبات المشروع',
    activity: 'تقرأ طلبات المشروع',
  },
  list_my_posts: {
    kind: 'read',
    label: 'قراءة منشوراتك ومسوداتك',
    activity: 'تقرأ منشوراتك ومسوداتك',
  },
  get_post_by_slug: { kind: 'read', label: 'قراءة منشور', activity: 'تقرأ منشوراً' },
  get_habits_summary: {
    kind: 'read',
    label: 'قراءة ملخّص عاداتك',
    activity: 'تقرأ ملخّص عاداتك',
  },
  get_expenses_summary: {
    kind: 'read',
    label: 'قراءة مصروفات هذا الشهر',
    activity: 'تقرأ مصروفات هذا الشهر',
  },
  list_habits: { kind: 'read', label: 'قراءة قائمة عاداتك', activity: 'تقرأ قائمة عاداتك' },
  get_logs: { kind: 'read', label: 'قراءة سجل العادات', activity: 'تقرأ سجل العادات' },
  list_categories: {
    kind: 'read',
    label: 'قراءة تصنيفات المصروفات',
    activity: 'تقرأ تصنيفات المصروفات',
  },
  list_transactions: {
    kind: 'read',
    label: 'قراءة العمليات في نطاق زمني',
    activity: 'تقرأ العمليات في نطاق زمني',
  },
  get_summary: { kind: 'read', label: 'قراءة ملخّص مصروفات شهر', activity: 'تقرأ ملخّص مصروفات شهر' },
  list_budgets: { kind: 'read', label: 'قراءة ميزانياتك', activity: 'تقرأ ميزانياتك' },
  get_latest_news: {
    kind: 'read',
    label: 'قراءة آخر الأخبار',
    activity: 'تقرأ آخر الأخبار',
  },
  get_news_item: { kind: 'read', label: 'قراءة خبر', activity: 'تقرأ خبراً' },
  get_rate: { kind: 'read', label: 'قراءة سعر الصرف', activity: 'تقرأ سعر الصرف' },
  get_rate_history: {
    kind: 'read',
    label: 'قراءة تاريخ سعر الصرف',
    activity: 'تقرأ تاريخ سعر الصرف',
  },
  create_post_draft: {
    kind: 'write',
    label: 'إنشاء مسودة منشور',
    activity: 'تنشئ مسودة منشور',
  },
  edit_post_draft: { kind: 'write', label: 'تعديل مسودة', activity: 'تعدّل مسودة' },
  publish_post_draft: { kind: 'write', label: 'نشر مسودة', activity: 'تنشر مسودة' },
  unpublish_post_draft: {
    kind: 'write',
    label: 'إعادة منشور إلى المسودات',
    activity: 'تعيد منشوراً إلى المسودات',
  },
  delete_post: { kind: 'write', label: 'حذف منشور', activity: 'تحذف منشوراً' },
  list_post_comments: {
    kind: 'read',
    label: 'قراءة تعليقات منشور',
    activity: 'تقرأ تعليقات منشور',
  },
  set_post_like: {
    kind: 'write',
    label: 'الإعجاب بمنشور أو إلغاؤه',
    activity: 'تضبط الإعجاب بمنشور',
  },
  create_post_comment: { kind: 'write', label: 'كتابة تعليق', activity: 'تكتب تعليقاً' },
  edit_post_comment: { kind: 'write', label: 'تعديل تعليقك', activity: 'تعدّل تعليقك' },
  delete_post_comment: { kind: 'write', label: 'حذف تعليقك', activity: 'تحذف تعليقك' },
  record_expense: { kind: 'write', label: 'تسجيل مصروف', activity: 'تسجّل مصروفاً' },
  edit_expense: { kind: 'write', label: 'تعديل مصروف', activity: 'تعدّل مصروفاً' },
  create_habit: { kind: 'write', label: 'إنشاء عادة', activity: 'تنشئ عادة' },
  set_habit_reminder: {
    kind: 'write',
    label: 'ضبط تذكير عادة',
    activity: 'تضبط تذكير عادة',
  },
  update_habit: { kind: 'write', label: 'تعديل عادة', activity: 'تعدّل عادة' },
  toggle_log: { kind: 'write', label: 'تسجيل إنجاز عادة', activity: 'تسجّل إنجاز عادة' },
  delete_habit: { kind: 'write', label: 'حذف عادة', activity: 'تحذف عادة' },
  create_category: { kind: 'write', label: 'إنشاء تصنيف مصروفات', activity: 'تنشئ تصنيف مصروفات' },
  set_budget: { kind: 'write', label: 'تحديد ميزانية', activity: 'تحدّد ميزانية' },
  delete_expense: { kind: 'write', label: 'حذف مصروف', activity: 'تحذف مصروفاً' },
  book_consultation: { kind: 'write', label: 'حجز استشارة', activity: 'تحجز استشارة' },
  cancel_consultation: { kind: 'write', label: 'إلغاء حجز استشارة', activity: 'تلغي حجز استشارة' },
  apply_training: { kind: 'write', label: 'تقديم طلب تدريب', activity: 'تقدّم طلب تدريب' },
  submit_project_request: {
    kind: 'write',
    label: 'إرسال طلب مشروع',
    activity: 'ترسل طلب مشروع',
  },
  change_display_name: {
    kind: 'write',
    label: 'تغيير اسم العرض',
    activity: 'تغيّر اسم العرض',
  },
  remember: {
    kind: 'write',
    label: 'حفظ ما أوصيت به',
    activity: 'تحفظ ما أوصيت به',
  },
  list_specialists: {
    kind: 'read',
    label: 'قراءة دليل المتخصصين',
    activity: 'تقرأ دليل المتخصصين',
  },
  load_specialist: { kind: 'read', label: 'تحميل متخصص', activity: 'تحمّل متخصصاً' },
  search_web: { kind: 'read', label: 'البحث في الويب', activity: 'تبحث في الويب' },
  find_app_tools: {
    kind: 'read',
    label: 'البحث في أدوات التطبيقات',
    activity: 'تبحث في أدوات التطبيقات',
  },
  get_screen_context: {
    kind: 'read',
    label: 'قراءة الشاشة الحالية',
    activity: 'تقرأ الشاشة الحالية',
  },
  admin_list_members: {
    kind: 'read',
    label: 'البحث عن الأعضاء',
    activity: 'تبحث عن الأعضاء',
  },
  admin_list_reports: {
    kind: 'read',
    label: 'قراءة بلاغات المحادثات',
    activity: 'تقرأ بلاغات المحادثات',
  },
  admin_decide_report: {
    kind: 'write',
    label: 'البتّ في بلاغ',
    activity: 'تبتّ في بلاغ',
  },
  list_surahs: {
    kind: 'read',
    label: 'قائمة السور',
    activity: 'يقرأ قائمة السور',
  },
  get_surah: {
    kind: 'read',
    label: 'سورة',
    activity: 'يقرأ السورة',
  },
  get_verse: {
    kind: 'read',
    label: 'آية',
    activity: 'يقرأ الآية',
  },
  search_quran: {
    kind: 'read',
    label: 'بحث في القرآن',
    activity: 'يبحث في القرآن',
  },
  list_athkar_sets: {
    kind: 'read',
    label: 'مجموعات الأذكار',
    activity: 'يقرأ مجموعات الأذكار',
  },
  get_athkar: {
    kind: 'read',
    label: 'أذكار',
    activity: 'يقرأ الأذكار',
  },
  get_scan_history: {
    kind: 'read',
    label: 'سجل المسح',
    activity: 'يقرأ سجل المسح',
  },
  list_links: {
    kind: 'read',
    label: 'قراءة روابطك المختصرة',
    activity: 'تقرأ روابطك المختصرة',
  },
  get_analytics: {
    kind: 'read',
    label: 'قراءة إحصاءات رابط',
    activity: 'تقرأ إحصاءات رابط',
  },
  create_link: { kind: 'write', label: 'اختصار رابط', activity: 'تختصر رابطاً' },
  update_link: {
    kind: 'write',
    label: 'تعديل رابط مختصر',
    activity: 'تعدّل رابطاً مختصراً',
  },
  delete_link: {
    kind: 'write',
    label: 'حذف رابط مختصر',
    activity: 'تحذف رابطاً مختصراً',
  },
  list_notes: { kind: 'read', label: 'قراءة ملاحظاتك', activity: 'تقرأ ملاحظاتك' },
  get_note: { kind: 'read', label: 'قراءة ملاحظة', activity: 'تقرأ ملاحظة' },
  create_note: { kind: 'write', label: 'إنشاء ملاحظة', activity: 'تنشئ ملاحظة' },
  update_note: { kind: 'write', label: 'تعديل ملاحظة', activity: 'تعدّل ملاحظة' },
  delete_note: { kind: 'write', label: 'حذف ملاحظة', activity: 'تحذف ملاحظة' },
};

export function isChatAgentToolName(value: string): value is ChatAgentToolName {
  return (CHAT_AGENT_TOOL_NAMES as readonly string[]).includes(value);
}

/** Only this status may be confirmed or declined. */
export function chatAgentActionIsOpen(status: ChatAgentActionStatus): boolean {
  return status === 'proposed';
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function amount(value: unknown): string {
  if (value === undefined || value === null || value === '') return '';
  const number = typeof value === 'number' ? value : Number(text(value));
  return Number.isFinite(number) ? String(number) : '';
}

/**
 * The two halves of a remote tool's audit name, or `null` for a first-party one.
 *
 * The stored form is `app:<connectionId>:<tool>`: stable across a rename and
 * across a second member connecting the same app, which is the whole reason the
 * model's `app_<slug>_<tool>` name is never persisted (ADR-0155, decision 11).
 */
export function appToolParts(tool: string): { connectionId: string; toolName: string } | null {
  if (!tool.startsWith('app:')) return null;
  const rest = tool.slice('app:'.length);
  const separator = rest.indexOf(':');
  if (separator <= 0 || separator === rest.length - 1) return null;
  return { connectionId: rest.slice(0, separator), toolName: rest.slice(separator + 1) };
}

/** The arguments a card shows for a tool we did not write, bounded and readable. */
function appArguments(values: Record<string, unknown>): string {
  return Object.entries(values)
    .slice(0, 3)
    .map(([key, value]) => {
      const shown =
        typeof value === 'string'
          ? value
          : typeof value === 'number' || typeof value === 'boolean'
            ? String(value)
            : (JSON.stringify(value) ?? '');
      return `${key}: ${shown.length > 40 ? `${shown.slice(0, 40)}…` : shown}`;
    })
    .filter((pair) => !pair.endsWith(': '))
    .join('، ');
}

/**
 * The proposal in plain words: the tool's name in Arabic, then the arguments a
 * member would recognise. It never throws — a proposal whose arguments do not
 * parse is exactly the case the confirm step refuses, and the card still has to
 * draw something readable.
 *
 * A remote tool has no Arabic label we wrote, so the card names the app the
 * member chose and the server's own tool name beside the arguments. `appName`
 * is resolved when the card is read; without it (a connection since deleted) the
 * card still says what was proposed.
 */
export function chatAgentActionSentence(
  tool: string,
  args: unknown,
  appName?: string | null
): string {
  const values = (typeof args === 'object' && args !== null ? args : {}) as Record<string, unknown>;

  const remote = appToolParts(tool);
  if (remote) {
    const app = text(appName ?? '') || 'تطبيق';
    const name = remote.toolName.replace(/[_-]+/g, ' ').trim() || 'إجراء';
    const shown = appArguments(values);
    return [`${app} — ${name}`, shown].filter(Boolean).join(' · ');
  }

  const info = isChatAgentToolName(tool) ? CHAT_AGENT_TOOLS[tool] : null;
  const label = info?.label ?? 'إجراء';

  const parts = [
    text(values.name),
    text(values.meta_title),
    text(values.slug) && `«${text(values.slug)}»`,
    text(values.content) && `«${text(values.content).slice(0, 60)}»`,
    text(values.description) && `«${text(values.description).slice(0, 60)}»`,
    text(values.full_name),
    text(values.course_slug),
  ].filter(Boolean);

  switch (tool) {
    case 'record_expense':
    case 'edit_expense': {
      const sum = amount(values.amount);
      const currency = text(values.currency);
      const money = sum ? `${sum}${currency ? ` ${currency}` : ''}` : '';
      return [label, money].filter(Boolean).join(' — ');
    }
    // An empty time removes the reminder here, in the form and in both producers (ADR-0211).
    case 'set_habit_reminder': {
      const at = text(values.reminder_time);
      return at ? `${label} — ${at}` : `${label} — إزالة التذكير`;
    }
    case 'toggle_log': {
      const date = text(values.date);
      const done =
        values.completed === true ? 'تمام' : values.completed === false ? 'غير مكتمل' : '';
      return date ? `${label} — ${date}${done ? ` — ${done}` : ''}` : label;
    }
    case 'set_budget': {
      const month = text(values.month);
      const sum = amount(values.amount);
      return month && sum ? `${label} — ${month} — ${sum}` : label;
    }
    case 'delete_habit': {
      const name = text(values.name);
      return name ? `${label} — «${name.slice(0, 60)}»` : label;
    }
    case 'delete_expense': {
      const name = text(values.name);
      const sum = amount(values.amount);
      return name ? `${label} — «${name.slice(0, 60)}»${sum ? ` — ${sum}` : ''}` : label;
    }
    case 'get_post_by_slug':
      return text(values.slug) ? `${label} «${text(values.slug)}»` : label;
    case 'remember': {
      // The fact is the card: the member reads what will be kept before saying
      // yes, which is the whole point of a write that is a proposal.
      const fact = text(values.text);
      return fact ? `${label} — «${fact.slice(0, 60)}»` : label;
    }
    case 'create_link': {
      const url = text(values.url);
      return url ? `${label} — «${url.slice(0, 60)}»` : label;
    }
    case 'delete_link': {
      const code = text(values.code);
      return code ? `${label} «${code}»` : label;
    }
    case 'create_note':
    case 'update_note':
    case 'create_post_comment':
    case 'edit_post_comment': {
      const body = text(values.body);
      return body ? `${label} — «${body.slice(0, 60)}»` : label;
    }
    case 'delete_post_comment': {
      // The body is the card's name for the row, not an argument the service uses.
      const body = text(values.body);
      return body ? `${label} — «${body.slice(0, 60)}»` : label;
    }
    case 'set_post_like': {
      const slug = text(values.slug);
      const state = values.liked === true ? 'إعجاب' : values.liked === false ? 'إلغاء إعجاب' : '';
      return slug ? `${label} — «${slug}»${state ? ` — ${state}` : ''}` : label;
    }
    case 'update_profile': {
      const name = text(values.name);
      const bio = text(values.bio);
      return name || bio ? `${label} — «${(name || bio).slice(0, 60)}»` : label;
    }
    case 'delete_note': {
      // A tier-3 card names the row: the member confirms the note, not an id
      // (ADR-0180). The handler checks the name against the row before deleting.
      const name = text(values.name) || text(values.body).split('\n')[0]?.trim() || '';
      return name ? `${label} — «${name.slice(0, 60)}»` : label;
    }
    // The admin cards (ADR-0180, decision 10). A report decision names the
    // outcome; the member lookup names the term it searched, so an empty search
    // still reads as "the whole directory".
    case 'admin_decide_report': {
      const decision = text(values.status);
      return decision === 'reviewed'
        ? `${label} — مراجعة`
        : decision === 'dismissed'
          ? `${label} — استبعاد`
          : label;
    }
    case 'admin_list_members':
    case 'admin_list_reports': {
      const term = text(values.search) || text(values.status);
      return term ? `${label} — «${term.slice(0, 60)}»` : label;
    }
    default:
      return parts.length > 0 ? `${label} — ${parts[0]}` : label;
  }
}
