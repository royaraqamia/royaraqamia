import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { connectionAffordsWarmUp } from '@/frontend/ui/assistant/assistant-warm-up';
import { ASSISTANT_OPENED_KEY } from '@/frontend/ui/assistant/assistant-hint';

/**
 * The warm-up gate (ADR-0230): the panel's chunk arrives before the tap only on
 * a connection that did not say the bytes are expensive.
 */
describe('connectionAffordsWarmUp', () => {
  it('warms when the browser reports no connection at all', () => {
    expect(connectionAffordsWarmUp(undefined)).toBe(true);
    expect(connectionAffordsWarmUp(null)).toBe(true);
    expect(connectionAffordsWarmUp({})).toBe(true);
  });

  it('does not warm when the member asked their browser to save data', () => {
    expect(connectionAffordsWarmUp({ saveData: true, effectiveType: '4g' })).toBe(false);
    expect(connectionAffordsWarmUp({ saveData: false, effectiveType: '4g' })).toBe(true);
  });

  it('does not warm on a 2g estimate, and does on 3g', () => {
    expect(connectionAffordsWarmUp({ effectiveType: 'slow-2g' })).toBe(false);
    expect(connectionAffordsWarmUp({ effectiveType: '2g' })).toBe(false);
    expect(connectionAffordsWarmUp({ effectiveType: '3g' })).toBe(true);
    expect(connectionAffordsWarmUp({ effectiveType: '4g' })).toBe(true);
  });

  it('is the entry perf/runtime-weight.json seeds for its returning column', () => {
    const artifact = JSON.parse(
      readFileSync(join(process.cwd(), 'perf/runtime-weight.json'), 'utf8')
    ) as { warmHint?: { localStorage?: Record<string, string> } };
    expect(artifact.warmHint?.localStorage?.[ASSISTANT_OPENED_KEY]).toBe('1');
  });
});
