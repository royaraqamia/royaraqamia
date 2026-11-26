'use client';

import type { AssistantSuggestion } from '@/shared/contracts/chat';
import { cn } from '@/frontend/shared/cn';
import { AssistantMark } from '@/frontend/ui/chats/assistant-mark';

/**
 * The assistant's first screen (#1859): one mark, the member's own state when
 * there is one, and the questions the registry says this member can ask.
 *
 * Every action carries its capability id in the DOM. The id comes from the
 * registry projection, not from this component, so a test can prove an action
 * advertises a tool that actually exists rather than a hand-written slogan.
 */
export function AssistantFirstScreen({
  lead,
  suggestions,
  onSuggestion,
  title,
  className,
}: {
  /** The sentence to lead with, already resolved by the caller. */
  lead: string;
  /** Projected from tier-0 registry entries; at least two when the registry has them. */
  suggestions: readonly AssistantSuggestion[];
  onSuggestion: (suggestion: AssistantSuggestion) => void;
  /** The full-page thread names its conversation; the floating sheet has a header. */
  title?: string;
  className?: string;
}) {
  return (
    <div
      data-assistant-first-screen
      className={cn('m-auto flex max-w-sm flex-col items-center gap-3 px-4 text-center', className)}
    >
      <AssistantMark className="size-12" glyphClassName="size-[52%]" />
      {title ? <p className="text-sm font-bold text-foreground">{title}</p> : null}
      <p className="text-xs leading-relaxed text-muted-foreground/80">{lead}</p>
      {suggestions.length > 0 ? (
        <div className="flex w-full flex-wrap items-center justify-center gap-2 pt-1">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.toolId}
              type="button"
              data-assistant-suggestion
              data-tool-id={suggestion.toolId}
              onClick={() => onSuggestion(suggestion)}
              className="rounded-full border border-border/70 bg-card/70 px-3 py-2 text-xs font-semibold text-foreground transition-safe hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {suggestion.ask}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
