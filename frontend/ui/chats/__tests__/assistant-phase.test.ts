import { describe, expect, it } from 'vitest';

import { assistantPhaseText } from '@/frontend/ui/chats/assistant-phase';
import { ASSISTANT_PANEL_COPY } from '@/frontend/ui/assistant/assistant-panel-copy';

/**
 * The list and the thread header draw the same four branches the panel does
 * (ADR-0173). The copy is one generated source, so this pins the sentence each
 * phase draws — a changed word breaks here rather than on one client only.
 */
describe('assistantPhaseText', () => {
  it('draws each phase in the shared copy', () => {
    expect(assistantPhaseText({ kind: 'thinking' })).toBe(ASSISTANT_PANEL_COPY.thinking);
    expect(assistantPhaseText({ kind: 'writing' })).toBe(ASSISTANT_PANEL_COPY.writing);
    expect(assistantPhaseText({ kind: 'proposal' })).toBe(ASSISTANT_PANEL_COPY.needsYou);
  });

  it('draws a tool’s own activity, which the server words', () => {
    expect(assistantPhaseText({ kind: 'tool', label: 'تقرأ شهاداتك' })).toBe('تقرأ شهاداتك');
  });

  it('draws nothing when no turn is running', () => {
    expect(assistantPhaseText(null)).toBeNull();
  });
});
