'use client';

import Link from 'next/link';
import { Send } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import type { ChatAssistantState } from '@/frontend/state/chats/use-chat-assistant';
import { CHAT_APP_CALLS_SPENT, type ChatAttachmentQuota } from '@/shared/contracts/chat';
import {
  ATTACHMENT_REFUSALS,
  exceedsDocumentLimit,
  exceedsImageLimit,
  stageFiles,
} from './attachment-quota';
import { ASSISTANT_COPY } from './assistant-copy';
import { ChatComposer } from './chat-composer';
import { shrinkChatImage } from './image-downscale';

const RESET_TIME_FORMAT = new Intl.DateTimeFormat('ar-u-nu-latn', {
  hour: 'numeric',
  minute: '2-digit',
  timeZone: 'Asia/Damascus',
});

/**
 * When the turn count is worth a line.
 *
 * A composer is not a dashboard: "40 من 40" every time the thread opens is noise
 * a member learns to read past, while the last few turns are the ones that
 * change what they can do today. Five is the point where a count stops being
 * trivia and starts being a warning — and even then it is said once, as a toast
 * when the allowance turns thin, not as a line parked under the field the way
 * it used to be.
 */
const TURNS_WORTH_SAYING = 5;

/** The spent-day sentence, from the server's own reset instant. */
function limitReachedSentence(resetsAt: string): string {
  const reset = new Date(resetsAt);
  const time = Number.isNaN(reset.getTime())
    ? ASSISTANT_COPY.midnight
    : RESET_TIME_FORMAT.format(reset);
  return ASSISTANT_COPY.limitReached.replace('{time}', time);
}

/**
 * The assistant's composer (ADR-0113, #817; ADR-0126 for the voice note,
 * ADR-0127 for the row it now shares with the member thread).
 *
 * Three states come before the input and each names its own remedy: no provider
 * key, a Free member, or a day whose allowance is spent. The row itself is
 * `ChatComposer`, the same control the member's thread draws — the paperclip
 * inside the field, the microphone-or-send slot at its end — so the two threads
 * cannot drift apart.
 */
export function AssistantComposer({
  assistant,
  quota,
  draft,
  onDraft,
  onAsk,
  placeholder = ASSISTANT_COPY.placeholder,
  sendLabel = ASSISTANT_COPY.send,
}: {
  assistant: ChatAssistantState;
  quota: ChatAttachmentQuota;
  draft: string;
  onDraft: (value: string) => void;
  onAsk: (body: string, files: File[]) => void;
  /** The thread says "اكتب سؤالك..."; the floating panel names نور (ADR-0143). */
  placeholder?: string;
  sendLabel?: string;
}) {
  const allowance = assistant.allowance;
  const [files, setFiles] = useState<File[]>([]);
  /**
   * The staged list as the writers see it. `files` is the render's copy, and a
   * pick that awaits a downscale would otherwise stage against a list from
   * before another pick landed.
   */
  const stagedRef = useRef<File[]>([]);
  /** True while a picked picture is being shrunk, which is not instant. */
  const [preparing, setPreparing] = useState(false);

  function setStaged(next: File[]) {
    stagedRef.current = next;
    setFiles(next);
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

  /** A refused attachment or a failed turn is a toast, never a line under the field. */
  useEffect(() => {
    if (assistant.error) toast.error(assistant.error, { id: 'assistant-composer-error' });
  }, [assistant.error]);

  // The last few turns are worth one toast, not a permanent line: it fires as
  // the count enters the window, and the spent state above takes over from
  // there. One `id` per subject, so each step down replaces the last instead of
  // stacking.
  useEffect(() => {
    // A plan that allows no turn has no allowance to count down: the locked
    // panel below is the whole answer, and "0 من 0" would read as a spent day.
    if (remaining === null || !allowance || allowance.member.cap === 0) return;
    if (remaining > TURNS_WORTH_SAYING) return;
    toast.info(
      ASSISTANT_COPY.remaining
        .replace('{remaining}', String(remaining))
        .replace('{cap}', String(allowance.member.cap)),
      { id: 'assistant-composer-remaining' }
    );
  }, [allowance, remaining]);

  /** Sends the draft and everything staged; a recorded clip is staged first. */
  function send(staged: File[] = files) {
    if (assistant.isStreaming || (!draft.trim() && staged.length === 0)) return;
    onAsk(draft, staged);
    setStaged([]);
  }

  /**
   * A pick is bounded before it is uploaded (ADR-0139): at most three pictures,
   * each shrunk to a prompt the model can read, and at most one document
   * (ADR-0140). The shrink runs before `stageFiles`, so the checks that already
   * exist — the per-file ceiling, the day's allowance — judge the bytes that
   * would actually be stored.
   */
  async function addFiles(picked: File[]) {
    if (picked.length === 0) return;
    if (exceedsImageLimit(stagedRef.current, picked)) {
      toast.error(ATTACHMENT_REFUSALS.tooManyImages, { id: 'assistant-composer-attachment' });
      return;
    }
    if (exceedsDocumentLimit(stagedRef.current, picked)) {
      toast.error(ATTACHMENT_REFUSALS.tooManyDocuments, { id: 'assistant-composer-attachment' });
      return;
    }

    // Decoding and re-encoding a phone photo is not instant, and a send that
    // fires before it lands would post without the picture.
    setPreparing(true);
    try {
      const shrunken = await Promise.all(picked.map((file) => shrinkChatImage(file)));
      // The ref, not the render's copy: two picks made while a picture was
      // still being shrunk would otherwise each stage against the list they saw
      // before it, and the second would drop the first.
      const staged = stageFiles(stagedRef.current, shrunken, quota);
      if ('refusal' in staged) {
        toast.error(staged.refusal, { id: 'assistant-composer-attachment' });
        return;
      }
      setStaged(staged.files);
    } finally {
      setPreparing(false);
    }
  }

  if (!assistant.available) {
    return (
      <p className="shrink-0 border-t border-border/40 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-center text-xs font-medium text-muted-foreground">
        {ASSISTANT_COPY.unavailable}
      </p>
    );
  }

  if (allowance && allowance.member.cap === 0) {
    return (
      <div className="shrink-0 space-y-1.5 border-t border-border/40 bg-card p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-center">
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
      <p className="shrink-0 border-t border-border/40 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] text-center text-xs font-medium text-muted-foreground">
        {limitReachedSentence(allowance.resetsAt)}
      </p>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        send();
      }}
      className="shrink-0 space-y-2 border-t border-border/40 bg-card p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]"
    >
      {/*
        The app meter sits beside the turn's (#1226). It is drawn only for a
        member who has an app to call and a plan that gives calls, and the spent
        sentence at zero is the same one the server hands a refused call.
      */}
      {allowance && allowance.apps.connected > 0 && allowance.apps.cap > 0 ? (
        <p
          className="px-1 text-[11px] font-medium text-muted-foreground/80"
          data-assistant-app-meter=""
        >
          {allowance.apps.used >= allowance.apps.cap
            ? CHAT_APP_CALLS_SPENT
            : ASSISTANT_COPY.appsMeter
                .replace('{used}', String(allowance.apps.used))
                .replace('{cap}', String(allowance.apps.cap))}
        </p>
      ) : null}
      <ChatComposer
        value={draft}
        onValueChange={onDraft}
        onSend={() => send()}
        files={files}
        onAddFiles={addFiles}
        onRemoveFile={(index) => setStaged(stagedRef.current.filter((_, at) => at !== index))}
        onRecorded={(clip) => {
          const staged = stageFiles(stagedRef.current, [clip], quota);
          if ('refusal' in staged) {
            toast.error(staged.refusal, { id: 'assistant-composer-attachment' });
            return;
          }
          send(staged.files);
        }}
        disabled={assistant.isStreaming || preparing}
        placeholder={placeholder}
        ariaLabel={placeholder}
        sendLabel={sendLabel}
        sendIcon={<Send size={16} />}
      />
    </form>
  );
}
