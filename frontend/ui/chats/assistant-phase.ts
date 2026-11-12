import { ASSISTANT_PANEL_COPY } from '@/frontend/ui/assistant/assistant-panel-copy';
import type { ChatAgentPhase } from '@/shared/contracts/chat';

/**
 * The assistant's phase in the chats list's and thread header's words (ADR-0173).
 *
 * The copy source is the panel's, because the panel is the reference component
 * that renders every one of these strings; this function only chooses which of
 * them a phase draws. A tool's line is the server's own `activity` — the tool
 * table lives on the server, so the app and the site cannot word it differently.
 *
 * The panel keeps the same four branches inline in `assistant-panel.tsx`, because
 * `check:parity` reads the reference component's own source for each key. The
 * two are pinned to the same output by `assistant-phase.test.ts`.
 */
export function assistantPhaseText(phase: ChatAgentPhase | null): string | null {
  switch (phase?.kind) {
    case 'thinking':
      return ASSISTANT_PANEL_COPY.thinking;
    case 'writing':
      return ASSISTANT_PANEL_COPY.writing;
    case 'tool':
      return phase.label;
    case 'proposal':
      return ASSISTANT_PANEL_COPY.needsYou;
    default:
      return null;
  }
}
