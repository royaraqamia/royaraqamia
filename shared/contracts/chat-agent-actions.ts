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
  'get_usage_state',
  'list_consultation_bookings',
  'list_consultation_options',
  'list_my_posts',
  'get_post_by_slug',
  'get_habits_summary',
  'get_expenses_summary',
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
  'create_post_draft',
  'edit_post_draft',
  'publish_post_draft',
  'record_expense',
  'edit_expense',
  'create_habit',
  'set_habit_reminder',
  'book_consultation',
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
] as const;

export type ChatAgentToolName = (typeof CHAT_AGENT_TOOL_NAMES)[number];

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
  get_usage_state: {
    kind: 'read',
    label: 'قراءة خطتك واستخدامك',
    activity: 'تقرأ خطتك واستخدامك',
  },
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
  record_expense: { kind: 'write', label: 'تسجيل مصروف', activity: 'تسجّل مصروفاً' },
  edit_expense: { kind: 'write', label: 'تعديل مصروف', activity: 'تعدّل مصروفاً' },
  create_habit: { kind: 'write', label: 'إنشاء عادة', activity: 'تنشئ عادة' },
  set_habit_reminder: {
    kind: 'write',
    label: 'ضبط تذكير عادة',
    activity: 'تضبط تذكير عادة',
  },
  book_consultation: { kind: 'write', label: 'حجز استشارة', activity: 'تحجز استشارة' },
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
    case 'set_habit_reminder': {
      const at = text(values.reminder_time);
      return at ? `${label} — ${at}` : `${label} — إزالة التذكير`;
    }
    case 'get_post_by_slug':
      return text(values.slug) ? `${label} «${text(values.slug)}»` : label;
    case 'remember': {
      // The fact is the card: the member reads what will be kept before saying
      // yes, which is the whole point of a write that is a proposal.
      const fact = text(values.text);
      return fact ? `${label} — «${fact.slice(0, 60)}»` : label;
    }
    default:
      return parts.length > 0 ? `${label} — ${parts[0]}` : label;
  }
}
