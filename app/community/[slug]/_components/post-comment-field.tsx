'use client';

import { Loader2, Send } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import { ChatField, type ChatFieldLabels } from '@/frontend/ui/chats/chat-field';
import { Button } from '@/frontend/ui/primitives/button';
import { POST_COMMENT_MAX_LENGTH } from '@/shared/contracts/community';
import { COMMUNITY_POST_COPY } from '../community-post-copy';

/** The six marks, in the thread's own words (ADR-0193). */
export const COMMENT_FIELD_LABELS: ChatFieldLabels = {
  toolbar: COMMUNITY_POST_COPY.formatToolbar,
  bold: COMMUNITY_POST_COPY.formatBold,
  italic: COMMUNITY_POST_COPY.formatItalic,
  underline: COMMUNITY_POST_COPY.formatUnderline,
  strike: COMMUNITY_POST_COPY.formatStrike,
  code: COMMUNITY_POST_COPY.formatCode,
  link: COMMUNITY_POST_COPY.formatLink,
  linkPrompt: COMMUNITY_POST_COPY.formatLinkPrompt,
  emoji: {
    open: COMMUNITY_POST_COPY.emojiPicker,
    search: COMMUNITY_POST_COPY.emojiSearch,
    noResults: COMMUNITY_POST_COPY.emojiNoResults,
    recent: COMMUNITY_POST_COPY.emojiRecent,
    categories: {
      smileys: COMMUNITY_POST_COPY.emojiCategorySmileys,
      gestures: COMMUNITY_POST_COPY.emojiCategoryGestures,
      hearts: COMMUNITY_POST_COPY.emojiCategoryHearts,
      animals: COMMUNITY_POST_COPY.emojiCategoryAnimals,
      food: COMMUNITY_POST_COPY.emojiCategoryFood,
      activity: COMMUNITY_POST_COPY.emojiCategoryActivity,
      travel: COMMUNITY_POST_COPY.emojiCategoryTravel,
      objects: COMMUNITY_POST_COPY.emojiCategoryObjects,
      symbols: COMMUNITY_POST_COPY.emojiCategorySymbols,
    },
  },
};

/** A count is worth showing only when it can still stop a refused send. */
const NEAR_LIMIT = Math.round(POST_COMMENT_MAX_LENGTH * 0.1);

/**
 * The post's input row: the chat composer's field and send slot, without the
 * paperclip or the microphone (comments carry text only). The ceiling is the
 * comment contract's, and the counter appears only near it — a row someone is
 * typing in stays as clean as the chat row.
 */
export function PostCommentField({
  value,
  onChange,
  onSend,
  disabled = false,
  sending = false,
  className,
  sendLabel = COMMUNITY_POST_COPY.commentSubmitLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  disabled?: boolean;
  sending?: boolean;
  className?: string;
  sendLabel?: string;
}) {
  const remaining = POST_COMMENT_MAX_LENGTH - value.length;

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-end gap-2">
        <div className="relative flex min-h-11 min-w-0 flex-1 items-end">
          <ChatField
            value={value}
            onChange={onChange}
            ariaLabel={COMMUNITY_POST_COPY.commentPlaceholder}
            placeholder={COMMUNITY_POST_COPY.commentPlaceholder}
            disabled={disabled}
            labels={COMMENT_FIELD_LABELS}
            maxLength={POST_COMMENT_MAX_LENGTH}
            className="w-full min-h-11 resize-none rounded-xl border border-border/70 bg-background py-2 pl-3 pr-3 text-base leading-[26px] text-foreground focus-visible:ring-2 focus-visible:ring-primary/40"
          />
        </div>
        <Button
          type="button"
          variant="hero"
          size="icon-sm"
          aria-label={sendLabel}
          data-visual="community-comment-send"
          disabled={disabled || sending || value.trim().length === 0}
          className="size-11"
          onClick={onSend}
        >
          {sending ? (
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send size={16} aria-hidden="true" />
          )}
        </Button>
      </div>
      {remaining <= NEAR_LIMIT && (
        <p
          data-visual="community-comment-remaining"
          className="mt-1 text-end text-[11px] font-medium text-muted-foreground"
        >
          {COMMUNITY_POST_COPY.commentRemaining.replace('{count}', String(remaining))}
        </p>
      )}
    </div>
  );
}
