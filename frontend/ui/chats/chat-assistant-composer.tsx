'use client';

import Link from 'next/link';
import { Send } from 'lucide-react';
import { useState } from 'react';

import type { ChatAssistantState } from '@/frontend/state/chats/use-chat-assistant';
import type { ChatAttachmentQuota } from '@/shared/contracts/chat';
import { stageFiles } from './attachment-quota';
import { ASSISTANT_COPY } from './assistant-copy';
import { ChatComposer } from './chat-composer';

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
 * The assistant's composer (ADR-0113, #817; ADR-0126 for the voice note,
 * ADR-0127 for the row it now shares with the member thread).
 *
 * Three states come before the input and each names its own remedy: no provider
 * key, a Free member, or a day whose allowance is spent. The row itself is
 * `ChatComposer`, the same control the member's thread draws — the paperclip,
 * the microphone beside it and the send button are one implementation, so the
 * two threads cannot drift apart.
 */
export function AssistantComposer({
  assistant,
  quota,
  draft,
  onDraft,
  onAsk,
}: {
  assistant: ChatAssistantState;
  quota: ChatAttachmentQuota;
  draft: string;
  onDraft: (value: string) => void;
  onAsk: (body: string, files: File[]) => void;
}) {
  const allowance = assistant.allowance;
  const [files, setFiles] = useState<File[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  /** Sends the draft and everything staged; a recorded clip is staged first. */
  function send(staged: File[] = files) {
    if (assistant.isStreaming || (!draft.trim() && staged.length === 0)) return;
    onAsk(draft, staged);
    setFiles([]);
  }

  function addFiles(picked: File[]) {
    const staged = stageFiles(files, picked, quota);
    if ('refusal' in staged) {
      setNotice(staged.refusal);
      return;
    }
    setNotice(null);
    setFiles(staged.files);
  }

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
        send();
      }}
      className="space-y-2 sticky bottom-0 z-10 border-t border-border/40 bg-card p-3"
    >
      <ChatComposer
        value={draft}
        onValueChange={onDraft}
        onSend={() => send()}
        files={files}
        onAddFiles={addFiles}
        onRemoveFile={(index) => setFiles((current) => current.filter((_, at) => at !== index))}
        onRecorded={(clip) => {
          const staged = stageFiles(files, [clip], quota);
          if ('refusal' in staged) {
            setNotice(staged.refusal);
            return;
          }
          setNotice(null);
          send(staged.files);
        }}
        disabled={assistant.isStreaming}
        placeholder={ASSISTANT_COPY.placeholder}
        ariaLabel={ASSISTANT_COPY.placeholder}
        sendLabel={ASSISTANT_COPY.send}
        sendIcon={<Send size={16} />}
      >
        {notice && (
          <p role="alert" className="text-[11px] font-medium text-destructive">
            {notice}
          </p>
        )}

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
      </ChatComposer>
    </form>
  );
}
