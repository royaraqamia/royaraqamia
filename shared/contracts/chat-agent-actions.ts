/**
 * What the assistant proposed, and how the thread words it (ADR-0113, #818).
 *
 * The row is written by the server and resolved by the member's own request;
 * both clients draw it, so the words live here rather than in either of them
 * (ADR-0098's reasoning, one layer before the app port of #819).
 */

export const CHAT_AGENT_ACTION_STATUSES = [
  'proposed',
  'confirmed',
  'rejected',
  'applied',
  'failed',
] as const;

export type ChatAgentActionStatus = (typeof CHAT_AGENT_ACTION_STATUSES)[number];

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
  'list_specialists',
  'load_specialist',
  // The recovery path for an app tool the router missed (ADR-0155, decision 7).
  // Declared only when the member has an enabled app, so a turn with no
  // connections carries no invitation to look for one.
  'find_app_tools',
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
}

export const CHAT_AGENT_TOOLS: Record<ChatAgentToolName, ChatAgentToolInfo> = {
  list_certificates: { kind: 'read', label: 'قراءة شهاداتك' },
  get_usage_state: { kind: 'read', label: 'قراءة خطتك واستخدامك' },
  list_consultation_bookings: { kind: 'read', label: 'قراءة حجوزات الاستشارة' },
  list_consultation_options: { kind: 'read', label: 'قراءة باقات الاستشارة ومواعيدها' },
  list_my_posts: { kind: 'read', label: 'قراءة منشوراتك ومسوداتك' },
  get_post_by_slug: { kind: 'read', label: 'قراءة منشور' },
  get_habits_summary: { kind: 'read', label: 'قراءة ملخّص عاداتك' },
  get_expenses_summary: { kind: 'read', label: 'قراءة مصروفات هذا الشهر' },
  create_post_draft: { kind: 'write', label: 'إنشاء مسودة منشور' },
  edit_post_draft: { kind: 'write', label: 'تعديل مسودة' },
  publish_post_draft: { kind: 'write', label: 'نشر مسودة' },
  record_expense: { kind: 'write', label: 'تسجيل مصروف' },
  edit_expense: { kind: 'write', label: 'تعديل مصروف' },
  create_habit: { kind: 'write', label: 'إنشاء عادة' },
  set_habit_reminder: { kind: 'write', label: 'ضبط تذكير عادة' },
  book_consultation: { kind: 'write', label: 'حجز استشارة' },
  apply_training: { kind: 'write', label: 'تقديم طلب تدريب' },
  submit_project_request: { kind: 'write', label: 'إرسال طلب مشروع' },
  change_display_name: { kind: 'write', label: 'تغيير اسم العرض' },
  list_specialists: { kind: 'read', label: 'قراءة دليل المتخصصين' },
  load_specialist: { kind: 'read', label: 'تحميل متخصص' },
  find_app_tools: { kind: 'read', label: 'البحث في أدوات التطبيقات' },
};

export function isChatAgentToolName(value: string): value is ChatAgentToolName {
  return (CHAT_AGENT_TOOL_NAMES as readonly string[]).includes(value);
}

/** Only this status may be confirmed or declined. */
export function chatAgentActionIsOpen(status: ChatAgentActionStatus): boolean {
  return status === 'proposed';
}

/**
 * The two words a proposal's card offers, and the one its title shows. Only the
 * open status gets buttons; a resolved row says what it became instead.
 */
export function chatAgentActionStatusLabel(status: ChatAgentActionStatus): string {
  switch (status) {
    case 'applied':
      return 'نُفِّذ';
    case 'failed':
      return 'لم يُنفَّذ';
    case 'rejected':
      return 'أُلغي';
    case 'confirmed':
      return 'قيد التنفيذ';
    case 'proposed':
      return 'بانتظار تأكيدك';
  }
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
    default:
      return parts.length > 0 ? `${label} — ${parts[0]}` : label;
  }
}
