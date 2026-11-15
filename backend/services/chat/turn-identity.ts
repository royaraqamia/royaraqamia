import type { AiChatMessage } from '@/backend/clients/ai-chat';
import type { UserProfile } from '@/backend/repositories/users/user-profile-repository';
import { screenContextMessages } from '@/backend/services/chat/turn-screen';
import type { PlanId } from '@/shared/contracts/plans';
import type { ScreenContextInput } from '@/shared/contracts/screen-context';

/**
 * The first context layer of a turn: who the member is (ADR-0182, decision 1).
 *
 * A name is not a passage and not a tool call. The account row is the answer,
 * so the server projects it into the prompt ahead of the thread, and the model
 * stops spending a round on "who am I?". Nothing here is inferred and nothing
 * is remembered: the block says what the row says, and only that.
 *
 * It is a projection rather than a copy of the row on purpose. The row carries
 * a member id, an Admin flag and a hidden flag, and a prompt that recites them
 * invites an id to be echoed into a tool call. What a turn needs is who to
 * address, what the account is entitled to, and what is connected.
 */

/** What the turn knows about the member before the first word. */
export interface TurnIdentity {
  /** Who to address: the name, or the handle when the row has no name. */
  displayName: string;
  username: string | null;
  avatarUrl: string | null;
  /** Whether the account has an address at all — never the address itself. */
  hasEmail: boolean;
  plan: PlanId;
  connectedApps: number;
}

/**
 * The block's ceiling, in characters: about four hundred tokens at the four
 * characters per token the history trim uses. A turn already spends its budget
 * on the thread, the tool declarations and the attachments, so this layer is
 * capped rather than trusted. The per-field clamps below are what hold it.
 */
export const IDENTITY_BLOCK_CHARS_MAX = 1_600;

/** Long enough for a real name, short enough that a row cannot flood a turn. */
const NAME_CHARS_MAX = 80;
const HANDLE_CHARS_MAX = 60;
/** A storage URL is longer than a name by nature; it is still one line. */
const URL_CHARS_MAX = 320;

/**
 * What a row with neither a name nor a handle is called. The handle column is
 * `not null`, so this is a database older than the handle, never the normal
 * case — but an empty string here would read as "the member is called nothing".
 */
const UNNAMED = 'عضو';

const PLAN_LABELS: Record<PlanId, string> = {
  free: 'المجانيَّة',
  pro: 'المدفوعة',
};

function clamp(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * The account row as the turn reads it. A read that answered nothing (no row,
 * no session) is `null`, and a turn with no projection carries no block —
 * there is nothing to say, and a guessed identity is worse than none.
 */
export function projectIdentity(input: {
  profile: Pick<UserProfile, 'name' | 'username' | 'avatar_url' | 'email'> | null;
  plan: PlanId;
  connectedApps?: number;
}): TurnIdentity | null {
  const { profile } = input;
  if (!profile) return null;

  const name = profile.name?.trim() ?? '';
  const username = profile.username?.trim() ?? '';

  return {
    displayName: name || username || UNNAMED,
    username: username || null,
    avatarUrl: profile.avatar_url?.trim() || null,
    hasEmail: Boolean(profile.email?.trim()),
    plan: input.plan,
    connectedApps: Math.max(0, Math.trunc(input.connectedApps ?? 0)),
  };
}

/**
 * The block itself, in the words the turn speaks.
 *
 * Two lines are load-bearing and both are instructions rather than data: that
 * the server supplied this, and that it is not to be asked for again. Without
 * them the model treats the block as a hint and asks the member to confirm
 * their own name — which is the tool call this layer exists to remove.
 *
 * The address is never written out. A turn sits beside results from apps we do
 * not own, so the one value worth protecting is kept out of the prompt rather
 * than fenced by an instruction the model can be talked out of (ADR-0182,
 * decision 5).
 */
export function identityBlock(identity: TurnIdentity): string {
  const lines = [
    '[هوية العضو — وصلت من الخادم]',
    `الاسم: ${clamp(identity.displayName, NAME_CHARS_MAX)}`,
    `اسم المستخدم: ${identity.username ? clamp(identity.username, HANDLE_CHARS_MAX) : 'غير محدَّد'}`,
    identity.hasEmail
      ? 'البريد: مسجَّل في الحساب — لا تكتبيه في الرد ولا ترسليه إلى أي أداة أو تطبيق.'
      : 'البريد: لا يوجد بريد مسجَّل في الحساب.',
    `الصورة الشخصية: ${identity.avatarUrl ? clamp(identity.avatarUrl, URL_CHARS_MAX) : 'لا توجد'}`,
    `الخطة: ${PLAN_LABELS[identity.plan]}`,
    `التطبيقات المتصلة: ${identity.connectedApps}`,
    'هذه المعلومات وصلت من الخادم وهي صحيحة كما هي: لا تطلبيها من العضو مرّة أخرى ولا تستدعي أداة لقراءتها.',
  ];

  return lines.join('\n');
}

/**
 * The context layers a turn opens with, in the order ADR-0182 fixes: identity
 * first, then the page's own state, then the standing prompt, then the thread.
 * Recall, the rolling summary and the tools' own declarations join this list as
 * their phases land, so the two call sites in the service stay one call.
 */
export function turnContextMessages(
  identity: TurnIdentity | null,
  screen?: ScreenContextInput
): AiChatMessage[] {
  return [
    ...(identity ? [{ role: 'system' as const, content: identityBlock(identity) }] : []),
    ...screenContextMessages(screen),
  ];
}
