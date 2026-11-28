import type { ChatFieldLabels } from './chat-field';
import { CHAT_THREAD_COPY } from './chat-thread-copy';

/**
 * The six marks the field offers, in the thread's own words (ADR-0193).
 *
 * One constant for the two places the editor appears — the composer's toolbar
 * and the bubble a line is edited in — so an aria-label cannot say «عريض» in
 * one and «غامق» in the other. It lives beside the field rather than in the
 * thread's screen because the message list now draws the editor too.
 */
export const CHAT_FIELD_LABELS: ChatFieldLabels = {
  toolbar: CHAT_THREAD_COPY.formatToolbar,
  bold: CHAT_THREAD_COPY.formatBold,
  italic: CHAT_THREAD_COPY.formatItalic,
  underline: CHAT_THREAD_COPY.formatUnderline,
  strike: CHAT_THREAD_COPY.formatStrike,
  code: CHAT_THREAD_COPY.formatCode,
  link: CHAT_THREAD_COPY.formatLink,
  linkPrompt: CHAT_THREAD_COPY.formatLinkPrompt,
  emoji: {
    open: CHAT_THREAD_COPY.emojiPicker,
    keyboard: CHAT_THREAD_COPY.emojiKeyboard,
    search: CHAT_THREAD_COPY.emojiSearch,
    noResults: CHAT_THREAD_COPY.emojiNoResults,
    recent: CHAT_THREAD_COPY.emojiRecent,
    categories: {
      smileys: CHAT_THREAD_COPY.emojiCategorySmileys,
      gestures: CHAT_THREAD_COPY.emojiCategoryGestures,
      hearts: CHAT_THREAD_COPY.emojiCategoryHearts,
      animals: CHAT_THREAD_COPY.emojiCategoryAnimals,
      food: CHAT_THREAD_COPY.emojiCategoryFood,
      activity: CHAT_THREAD_COPY.emojiCategoryActivity,
      travel: CHAT_THREAD_COPY.emojiCategoryTravel,
      objects: CHAT_THREAD_COPY.emojiCategoryObjects,
      symbols: CHAT_THREAD_COPY.emojiCategorySymbols,
    },
  },
};
