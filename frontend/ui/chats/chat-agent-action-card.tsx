'use client';

import { useState } from 'react';

import { cn } from '@/frontend/shared/cn';
import {
  chatAgentActionIsOpen,
  chatAgentActionSentence,
  chatAgentActionStatusLabel,
  type ChatAgentAction,
} from '@/shared/contracts/chat-agent-actions';
import { ASSISTANT_COPY } from './assistant-copy';

/**
 * The proposal (ADR-0113, #818): the tool in the member's words, the arguments
 * it was given, and the two answers. Nothing here writes anything — the buttons
 * ask the server, and the server runs the write as this member.
 *
 * A resolved card keeps its words and says what it became; a refusal shows the
 * service's own sentence, which is the reason the write did not happen.
 *
 * Its own component because proposals belong to the assistant's thread: the app
 * draws a member's thread natively and hands the assistant's back to the
 * document, so the reference for the ported thread is the thread without them.
 */
export function ActionCard({
  action,
  onResolve,
}: {
  action: ChatAgentAction;
  onResolve: (actionId: string, answer: 'confirm' | 'reject') => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const open = chatAgentActionIsOpen(action.status);
  const reason = typeof action.result?.error === 'string' ? action.result.error : null;

  const resolve = async (answer: 'confirm' | 'reject') => {
    setBusy(true);
    try {
      await onResolve(action.id, answer);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full max-w-[85%] rounded-2xl border border-border/70 bg-card/80 px-3 py-2 text-sm shadow-xs">
      <p className="font-bold leading-relaxed text-foreground">
        {chatAgentActionSentence(action.tool, action.args, action.appName)}
      </p>
      <p
        className={cn(
          'mt-1 text-[11px]',
          action.status === 'applied'
            ? 'text-emerald-600 dark:text-emerald-400'
            : action.status === 'failed'
              ? 'text-destructive'
              : 'text-muted-foreground'
        )}
      >
        {chatAgentActionStatusLabel(action.status)}
      </p>
      {reason && <p className="mt-1 text-xs leading-relaxed text-destructive">{reason}</p>}

      {open && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void resolve('confirm')}
            className="rounded-lg bg-primary px-3 py-1 text-xs font-bold text-primary-foreground transition-safe hover:bg-primary/90 disabled:opacity-60"
          >
            {ASSISTANT_COPY.confirmAction}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void resolve('reject')}
            className="rounded-lg border border-border/70 px-3 py-1 text-xs font-bold text-muted-foreground transition-safe hover:bg-muted/60 disabled:opacity-60"
          >
            {ASSISTANT_COPY.cancelAction}
          </button>
        </div>
      )}
    </div>
  );
}
