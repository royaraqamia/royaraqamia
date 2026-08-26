import { describe, it, expect } from 'vitest';
import { HABIT_TEMPLATES } from '@/frontend/shared/habitflow/habit-templates';

describe('HABIT_TEMPLATES', () => {
  it('always has at least one template so onboarding is never empty', () => {
    expect(HABIT_TEMPLATES.length).toBeGreaterThan(0);
  });

  it('has unique, non-empty names with a valid frequency', () => {
    const names = new Set<string>();
    for (const t of HABIT_TEMPLATES) {
      expect(t.name.trim().length).toBeGreaterThan(0);
      expect(['daily', 'weekly']).toContain(t.frequency);
      expect(names.has(t.name)).toBe(false);
      names.add(t.name);
    }
  });
});
