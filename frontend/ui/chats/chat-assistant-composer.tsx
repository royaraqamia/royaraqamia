'use client';

import Link from 'next/link';
import { Send } from 'lucide-react';

import { Button } from '@/frontend/ui/primitives/button';
import type { ChatAssistantState } from '@/frontend/state/chats/use-chat-assistant';
import { ASSISTANT_COPY } from './assistant-copy';

const RESET_TIME_FORMAT = new Intl.DateTimeFormat('ar-u-nu-latn', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Damascus',
});

/** The spent-day sentence, from the server's own reset instant. */
function limitReachedSentence(resetsAt: string): string {
  const reset = new Date(resetsAt);
  const time = Number.isNaN(reset.getTime())
    ? ASSISTANT_COPY.midnight
    : RESET_TIME_FORMAT.format(reset);
  return ASSISTANT_COPY.limitReached.replace('{time}', time);
}

/**
 * The assistant's composer (ADR-0113, #817). Three states come before the input
 * and each names its own remedy: no provider key, a Free member, or a day whose
 * allowance is spent. The input itself is text only — no files, no reply-to.
 *
 * It is its own component because the assistant's thread is a different screen
 * from a member's: it is the one place the app hands back to the document, and
 * keeping it here is what makes the member thread's reference component the
 * thread the app actually draws (#819).
 */
export function AssistantComposer({
  assistant,
  draft,
  onDraft,
  onAsk,
}: {
  assistant: ChatAssistantState;
  draft: string;
  onDraft: (value: string) => void;
  onAsk: (body: string) => void;
}) {
  const allowance = assistant.allowance;

  if (!assistant.available) {
    return (
      <p className="border-t border-border/40 px-4 py-3 text-center text-xs font-medium text-muted-foreground">
        {ASSISTANT_COPY.unavailable}
      </p>
    );
  }

  if (allowance && allowance.member.cap === 0) {
    return (
      <div className="space-y-1.5 sticky bottom-0 z-10 border-t border-border/40 bg-card p-3 text-center">
        <p className="text-xs text-muted-foreground">{ASSISTANT_COPY.locked}</p>
        <Link
          href="/pricing"
          className="inline-block text-xs font-bold text-primary hover:underline"
        >
          {ASSISTANT_COPY.upgrade}
        </Link>
      </div>
    );
  }

  const spent = allowance
    ? allowance.member.used >= allowance.member.cap ||
      allowance.project.used >= allowance.project.limit
    : false;

  if (allowance && spent) {
    return (
      <p className="border-t border-border/40 px-4 py-3 text-center text-xs font-medium text-muted-foreground">
        {limitReachedSentence(allowance.resetsAt)}
      </p>
    );
  }

  const remaining = allowance
    ? Math.max(
        0,
        Math.min(
          allowance.member.cap - allowance.member.used,
          allowance.project.limit - allowance.project.used
        )
      )
    : null;

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        onAsk(draft);
      }}
      className="space-y-2 sticky bottom-0 z-10 border-t border-border/40 bg-card p-3"
    >
      <div className="flex items-end gap-2">
        <textarea
          value={draft}
          onChange={(event) => onDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              onAsk(draft);
            }
          }}
          rows={1}
          maxLength={4000}
          placeholder={ASSISTANT_COPY.placeholder}
          aria-label={ASSISTANT_COPY.placeholder}
          className="max-h-32 min-h-10 flex-1 resize-none rounded-xl border border-border/70 bg-background px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-primary/40"
        />
        <Button
          type="submit"
          variant="hero"
          size="icon-sm"
          aria-label={ASSISTANT_COPY.send}
          disabled={assistant.isStreaming || draft.trim().length === 0}
        >
          <Send size={16} />
        </Button>
      </div>

      {remaining !== null && allowance && (
        <p className="text-[11px] text-muted-foreground/70">
          {ASSISTANT_COPY.remaining
            .replace('{remaining}', String(remaining))
            .replace('{cap}', String(allowance.member.cap))}
        </p>
      )}

      {assistant.error && (
        <p role="alert" className="text-[11px] font-medium text-destructive">
          {assistant.error}
        </p>
      )}
    </form>
  );
}
