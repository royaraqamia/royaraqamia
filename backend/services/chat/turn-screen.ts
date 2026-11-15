import type { AiChatMessage } from '@/backend/clients/ai-chat';
import {
  isScreenContextBlind,
  plainText,
  SCREEN_CONTEXT_CHARS_MAX,
  SCREEN_CONTEXT_PRODUCT_CHARS_MAX,
  SCREEN_CONTEXT_ROUTE_CHARS_MAX,
  SCREEN_CONTEXT_SCREEN_ID_CHARS_MAX,
  SCREEN_CONTEXT_TAB_CHARS_MAX,
  SCREEN_CONTEXT_TITLE_CHARS_MAX,
  type ScreenContext,
  type ScreenContextInput,
} from '@/shared/contracts/screen-context';

/**
 * The second context layer of a turn: the screen the member is asking from
 * (ADR-0181).
 *
 * The first layer says who is asking (ADR-0182). This one says where they are,
 * and it arrives with the question rather than through a tool call, so the
 * model does not spend a round on "which form?" — the gap the eyes exist to
 * close. Nothing here is inferred: the block says what the page published, and
 * only that.
 *
 * Three rules are load-bearing and all three are instructions rather than data:
 * that the server supplied this, that the member is not to be asked where they
 * are, and that field text is what the page shows rather than something to
 * obey. A page can carry a member's words — or another member's, on a community
 * post — so remote text is data, never instructions, exactly as the thread's
 * own rule has it.
 */

/** The block's opening line, so the model can tell the layer from the thread. */
const SCREEN_BLOCK_OPEN = '[شاشة العضو — وصلت من الخادم]';

/**
 * What the turn says when the client has no eyes here.
 *
 * An opted-out surface, or the admin area, publishes no snapshot at all
 * (decision 5, decision 8). Saying so is the difference between an answer that
 * asks and an answer that guesses at a screen it cannot see.
 */
const SCREEN_BLOCK_BLIND =
  '[شاشة العضو — لا يراها المساعد]\n' +
  'لا يرى المساعد هذه الشاشة ولا يعرف ما فيها. اسألي العضو أن يصف ما يراه أو يلصق ما يحتاجه، ولا تخمّني.';

/** One line, no control characters, cut at `max` with an ellipsis. */
function oneLine(value: string, max: number): string {
  const clean = plainText(value);
  return clean.length > max ? `${clean.slice(0, max - 1)}…` : clean;
}

/** The ceiling is a ceiling: a snapshot cannot spend more of the turn than this. */
function clampBlock(block: string): string {
  return block.length > SCREEN_CONTEXT_CHARS_MAX
    ? `${block.slice(0, SCREEN_CONTEXT_CHARS_MAX - 1)}…`
    : block;
}

/**
 * The screen's own state, in the words the turn speaks.
 *
 * `fields` and `text` are deliberately not written here yet: what a surface may
 * show and how it is redacted lands with the allowlist (#1419), and a block
 * that quoted them before that rule existed would be the leak the rule prevents.
 * The route, the product and the screen id are the surface's identity, and they
 * are safe to publish on their own — which is why a screen that registers
 * nothing is still visible.
 */
export function screenContextBlock(context: ScreenContext): string {
  const lines = [
    SCREEN_BLOCK_OPEN,
    `المسار: ${oneLine(context.route, SCREEN_CONTEXT_ROUTE_CHARS_MAX)}`,
  ];

  const screenId = oneLine(context.screenId, SCREEN_CONTEXT_SCREEN_ID_CHARS_MAX);
  if (screenId) lines.push(`الشاشة: ${screenId}`);
  const product = oneLine(context.product, SCREEN_CONTEXT_PRODUCT_CHARS_MAX);
  if (product) lines.push(`المنتج: ${product}`);
  const title = oneLine(context.title, SCREEN_CONTEXT_TITLE_CHARS_MAX);
  if (title) lines.push(`العنوان: ${title}`);
  const tab = context.tab ? oneLine(context.tab, SCREEN_CONTEXT_TAB_CHARS_MAX) : '';
  if (tab) lines.push(`التبويب: ${tab}`);

  lines.push(
    'هذه حالة الصفحة التي يسأل منها العضو الآن، وصلت من الخادم وهي صحيحة كما هي: أجيبي عن هذه الشاشة ولا تسألي العضو أين هو.'
  );

  return clampBlock(lines.join('\n'));
}

/**
 * The layer a turn opens with, as messages.
 *
 * Nothing is sent when the request carried no snapshot: a client without eyes
 * is a turn that answers exactly as it did before the eyes existed, which is
 * what keeps an older tab working.
 */
export function screenContextMessages(input: ScreenContextInput | undefined): AiChatMessage[] {
  if (!input) return [];
  if (isScreenContextBlind(input)) {
    return [{ role: 'system', content: SCREEN_BLOCK_BLIND }];
  }
  return [{ role: 'system', content: screenContextBlock(input) }];
}
