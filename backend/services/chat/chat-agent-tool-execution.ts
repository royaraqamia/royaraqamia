import type { ChatAgentTool, ChatAgentToolContext } from '@/backend/services/chat/chat-agent-tools';
import { MissingScopeError } from '@/backend/services/mcp/tools/guards';
import { AppError } from '@/backend/shared/errors';
import { RepositoryError } from '@/backend/shared/repository-error';

/**
 * The one executor for a first-party tool (ADR-0180 decision 3, #1438).
 *
 * The confirm path and a granted call in a turn both cross this seam, so a
 * granted tool cannot grow a second writer or a second refusal vocabulary: the
 * schema is parsed here, the tool runs as the member, and a refusal is turned
 * into the member's sentence here. The caller decides only what the outcome is
 * recorded against — the proposal row it claimed, or the audit row a grant
 * leaves.
 */
export type FirstPartyToolOutcome =
  { status: 'applied'; result: unknown } | { status: 'failed'; error: string };

export async function executeFirstPartyTool(
  tool: ChatAgentTool,
  args: unknown,
  context: ChatAgentToolContext
): Promise<FirstPartyToolOutcome> {
  const parsed = tool.schema.safeParse(args);
  if (!parsed.success) {
    return {
      status: 'failed',
      error: parsed.error.issues[0]?.message ?? 'بيانات الإجراء غير صالحة',
    };
  }

  try {
    const result = await tool.run(parsed.data, context);
    // A service that answers `{ error }` refused the write in words meant for
    // the member (a category that does not exist, a post already published).
    if (isRefusal(result)) return { status: 'failed', error: result.error };
    return { status: 'applied', result: result ?? null };
  } catch (error) {
    return { status: 'failed', error: refusalSentence(error) };
  }
}

/**
 * A remote call the server itself marked as failed, in the words it wrote.
 *
 * `isError` is the MCP server's own verdict about the call: it ran and refused,
 * which is a different outcome from a call that never reached it, and the card
 * has to say so rather than claim the write was applied. The text is the
 * server's, so it is bounded like any other untrusted content.
 */
export function remoteRefusal(result: unknown): string | null {
  if (typeof result !== 'object' || result === null) return null;
  if ((result as { isError?: unknown }).isError !== true) return null;

  const content = (result as { content?: unknown }).content;
  const words = Array.isArray(content)
    ? content
        .map((block) =>
          typeof block === 'object' &&
          block !== null &&
          typeof (block as { text?: unknown }).text === 'string'
            ? (block as { text: string }).text.trim()
            : ''
        )
        .filter(Boolean)
        .join(' ')
    : '';

  return words ? words.slice(0, 300) : 'رفض التطبيق تنفيذ الإجراء.';
}

export function isRefusal(value: unknown): value is { error: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof (value as { error: unknown }).error === 'string'
  );
}

/**
 * What the card writes when the write itself refused. A policy's own sentence
 * (`AppError`, `ChatError`) is the reason; a database refusal is translated,
 * because "the plan cap for community_drafts is reached" is not the member's
 * language; anything else is a fault, and its internals are not theirs to read.
 */
export function refusalSentence(error: unknown): string {
  const fromDatabase = databaseReason(error);
  if (fromDatabase) return fromDatabase;

  // An admin capability whose flag is gone is a refusal about the member's
  // standing, not a tool failure; the English scope sentence is not theirs.
  if (error instanceof MissingScopeError) return 'هذه الأداة متاحة للمشرفين فقط.';

  if (error instanceof AppError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;
  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string' &&
    (error as { message: string }).message.trim()
  ) {
    return (error as { message: string }).message;
  }
  return 'تعذّر تنفيذ الإجراء.';
}

/**
 * The database's own refusals, in the member's words. `PL001` is the plan cap
 * that `private.enforce_owned_item_cap` raises; the rest are the guards a route
 * would otherwise have checked first (a post that is not there, a missing
 * column, a policy).
 */
function databaseReason(error: unknown): string | null {
  const cause = error instanceof RepositoryError ? error.cause : error;
  if (typeof cause !== 'object' || cause === null) return null;

  const code = String((cause as { code?: unknown }).code ?? '');
  switch (code) {
    case 'PL001':
      return 'بلغت حدّ خطتك لهذا العنصر، ولا يمكن إضافة المزيد.';
    case '42501':
      return 'لا يمكن تنفيذ هذا الإجراء بحسابك.';
    case 'P0002':
      return 'لم أجد هذا العنصر.';
    case '22023':
      return 'البيانات المرسلة غير مكتملة.';
    default:
      return null;
  }
}
