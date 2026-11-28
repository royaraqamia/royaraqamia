'use client';

import { useState } from 'react';

import { cn } from '@/frontend/shared/cn';
import {
  chatAgentActionIsOpen,
  chatAgentActionSentence,
  chatAgentToolIsAdmin,
  type ChatAgentAction,
  type ChatAgentActionStatus,
} from '@/shared/contracts/chat-agent-actions';

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
/** The card's words, from the assistant panel's one copy source (ADR-0098). */
export type ActionCardLabels = Record<ChatAgentActionStatus, string> & {
  confirm: string;
  reject: string;
  /** The visible admin mark an operator's confirm carries (ADR-0180, decision 10). */
  adminMark: string;
  /** The trust an applied tier-1 card may win in one tap (ADR-0180, decision 2). */
  grant: string;
  granted: string;
  grantFailed: string;
};

export function ActionCard({
  action,
  labels,
  onResolve,
  canGrant = false,
  alreadyGranted = false,
  onGrant,
}: {
  action: ChatAgentAction;
  labels: ActionCardLabels;
  onResolve: (actionId: string, answer: 'confirm' | 'reject') => Promise<string | null>;
  /** Whether the server offers this applied tool as a tier-1 grant. */
  canGrant?: boolean;
  /** The member already granted this tool, here or on `/assistant`. */
  alreadyGranted?: boolean;
  /** Grant one tool from its own applied card: `null` when done, else the refusal. */
  onGrant?: (toolId: string) => Promise<string | null>;
}) {
  const [busy, setBusy] = useState(false);
  const [granting, setGranting] = useState(false);
  const [grantedHere, setGrantedHere] = useState(false);
  const [grantError, setGrantError] = useState<string | null>(null);
  const open = chatAgentActionIsOpen(action.status);
  const reason = typeof action.result?.error === 'string' ? action.result.error : null;
  /**
   * The grant is born in the conversation, but only after the member has seen
   * the tool run (ADR-0180, decision 2). The list decides `canGrant` from the
   * server's own tier-1 answer, so a tier-2 or tier-3 card never draws it.
   */
  const applied = action.status === 'applied';
  const granted = alreadyGranted || grantedHere;
  const offerGrant = applied && !granted && canGrant && onGrant !== undefined;

  const resolve = async (answer: 'confirm' | 'reject') => {
    setBusy(true);
    try {
      await onResolve(action.id, answer);
    } finally {
      setBusy(false);
    }
  };

  const grant = async () => {
    if (!onGrant) return;
    setGranting(true);
    setGrantError(null);
    try {
      const refusal = await onGrant(action.tool);
      if (refusal === null) setGrantedHere(true);
      else setGrantError(refusal || labels.grantFailed);
    } finally {
      setGranting(false);
    }
  };

  return (
    <div className="w-full max-w-[85%] rounded-2xl border border-border/70 bg-card/80 px-3 py-2 text-sm shadow-xs">
      {chatAgentToolIsAdmin(action.tool) && (
        // The one thing an admin's confirm must never be is indistinguishable
        // from a routine one (ADR-0180, decision 10).
        <span className="mb-1 inline-block rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-bold text-amber-700 dark:text-amber-400">
          {labels.adminMark}
        </span>
      )}
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
        {labels[action.status]}
      </p>
      {reason && <p className="mt-1 text-xs leading-relaxed text-destructive">{reason}</p>}

      {open && (
        <div className="mt-2 flex gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void resolve('confirm')}
            className="rounded-lg bg-selected px-3 py-1 text-xs font-bold text-selected-foreground transition-safe hover:bg-selected/90 disabled:opacity-60"
          >
            {labels.confirm}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void resolve('reject')}
            className="rounded-lg border border-border/70 px-3 py-1 text-xs font-bold text-muted-foreground transition-safe hover:bg-muted/60 disabled:opacity-60"
          >
            {labels.reject}
          </button>
        </div>
      )}

      {applied && granted && (
        <p
          role="status"
          className="mt-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400"
        >
          {labels.granted}
        </p>
      )}
      {offerGrant && (
        <div className="mt-2">
          <button
            type="button"
            disabled={granting}
            onClick={() => void grant()}
            className="rounded-lg border border-primary/40 px-3 py-1 text-xs font-bold text-primary transition-safe hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-60"
          >
            {labels.grant}
          </button>
        </div>
      )}
      {grantError && (
        <p role="alert" className="mt-1 text-xs leading-relaxed text-destructive">
          {grantError}
        </p>
      )}
    </div>
  );
}
