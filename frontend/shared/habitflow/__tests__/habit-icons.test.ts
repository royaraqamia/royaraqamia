import { describe, it, expect } from 'vitest';
import {
  getIconComponent,
  getIconColorClass,
  HABIT_ICONS,
} from '@/frontend/shared/habitflow/habit-icons';
import { Activity } from 'lucide-react';

describe('getIconComponent', () => {
  it('returns the matching icon component for a known name', () => {
    const component = getIconComponent('Droplet');
    expect(component).toBeDefined();
    expect(component).not.toBeNull();
  });

  it('returns a valid component for every entry in HABIT_ICONS', () => {
    for (const entry of HABIT_ICONS) {
      const component = getIconComponent(entry.name);
      expect(component).toBeDefined();
      expect(component).not.toBeNull();
    }
  });

  it('falls back to Activity for unknown names', () => {
    expect(getIconComponent('Nope')).toBe(Activity);
    expect(getIconComponent('')).toBe(Activity);
  });
});

describe('getIconColorClass', () => {
  it('returns the color class for a known name', () => {
    expect(getIconColorClass('Droplet')).toContain('text-indigo-500');
  });

  it('falls back to the gray classes for unknown names', () => {
    expect(getIconColorClass('Nope')).toBe('text-gray-500 bg-gray-50');
  });
});

describe('HABIT_ICONS', () => {
  it('contains unique names', () => {
    const names = HABIT_ICONS.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('has 16 entries', () => {
    expect(HABIT_ICONS).toHaveLength(16);
  });
});
