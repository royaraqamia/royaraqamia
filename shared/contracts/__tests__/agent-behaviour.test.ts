import { describe, expect, it } from 'vitest';

import {
  RULE_IDS,
  RULES,
  SENTENCE_CAP,
  behaviourLines,
} from '@/shared/contracts/agent-behaviour.mjs';

describe('the rules every agent door shares', () => {
  it('gives each door one line per rule plus its own length cap', () => {
    for (const surface of ['terminal', 'telegram', 'assistant'] as const) {
      const lines = behaviourLines({ surface });
      expect(lines).toHaveLength(RULES.length + 1);
      expect(lines.at(-1)).toContain(String(SENTENCE_CAP[surface]));
    }
  });

  it('pins the caps the three doors agreed on', () => {
    expect(SENTENCE_CAP).toEqual({ terminal: 3, telegram: 4, assistant: 4 });
  });

  it('writes every rule in both languages, with nothing empty', () => {
    const english = behaviourLines({ surface: 'terminal', language: 'en' });
    const arabic = behaviourLines({ surface: 'terminal', language: 'ar' });
    expect(english).toHaveLength(arabic.length);
    for (const [index, line] of english.entries()) {
      expect(line.length).toBeGreaterThan(0);
      expect(arabic[index]?.length).toBeGreaterThan(0);
      expect(arabic[index]).not.toBe(line);
    }
  });

  it('refuses a surface nobody defined a cap for', () => {
    expect(() => behaviourLines({ surface: 'unknown' })).toThrow(/unknown agent surface/);
  });

  it('keeps the ids unique and in step with the list', () => {
    expect(new Set(RULE_IDS).size).toBe(RULES.length);
    expect(RULE_IDS).toHaveLength(RULES.length);
  });
});
