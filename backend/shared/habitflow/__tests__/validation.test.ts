import { describe, it, expect } from 'vitest';
import {
  createHabitSchema,
  updateHabitSchema,
  toggleLogSchema,
} from '@/backend/shared/habitflow/validation';

describe('createHabitSchema', () => {
  it('accepts a minimal valid input with defaults applied', () => {
    const result = createHabitSchema.safeParse({ name: 'قراءة' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe('قراءة');
      expect(result.data.icon).toBe('Activity');
      expect(result.data.frequency).toBe('daily');
    }
  });

  it('accepts explicit icon and frequency', () => {
    const result = createHabitSchema.safeParse({
      name: 'رياضة',
      icon: 'Dumbbell',
      frequency: 'weekly',
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.icon).toBe('Dumbbell');
      expect(result.data.frequency).toBe('weekly');
    }
  });

  it('trims whitespace from the name', () => {
    const result = createHabitSchema.safeParse({ name: '  صلاة  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('صلاة');
  });

  it('rejects a missing/empty name', () => {
    expect(createHabitSchema.safeParse({ name: '' }).success).toBe(false);
    expect(createHabitSchema.safeParse({}).success).toBe(false);
  });

  it('rejects an invalid frequency', () => {
    expect(createHabitSchema.safeParse({ name: 'قراءة', frequency: 'yearly' }).success).toBe(false);
  });
});

describe('updateHabitSchema', () => {
  it('requires an id and name', () => {
    expect(updateHabitSchema.safeParse({ id: '', name: 'قراءة' }).success).toBe(false);
    expect(updateHabitSchema.safeParse({ id: 'h-1', name: '' }).success).toBe(false);
  });

  it('accepts a valid full update', () => {
    const result = updateHabitSchema.safeParse({ id: 'h-1', name: 'قراءة', icon: 'BookOpen' });
    expect(result.success).toBe(true);
  });

  it('rejects an invalid frequency', () => {
    expect(
      updateHabitSchema.safeParse({ id: 'h-1', name: 'قراءة', frequency: 'monthly' }).success
    ).toBe(false);
  });

  it('trims the name', () => {
    const result = updateHabitSchema.safeParse({ id: 'h-1', name: '  قراءة  ' });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.name).toBe('قراءة');
  });
});

describe('toggleLogSchema', () => {
  it('accepts a valid input', () => {
    const result = toggleLogSchema.safeParse({
      habitId: 'h-1',
      date: '2026-08-02',
      completed: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing habitId or date', () => {
    expect(
      toggleLogSchema.safeParse({ habitId: '', date: '2026-08-02', completed: true }).success
    ).toBe(false);
    expect(toggleLogSchema.safeParse({ habitId: 'h-1', date: '', completed: true }).success).toBe(
      false
    );
  });

  it('rejects a malformed date', () => {
    expect(
      toggleLogSchema.safeParse({ habitId: 'h-1', date: '02-08-2026', completed: true }).success
    ).toBe(false);
    expect(
      toggleLogSchema.safeParse({ habitId: 'h-1', date: '2026-8-2', completed: true }).success
    ).toBe(false);
    expect(
      toggleLogSchema.safeParse({ habitId: 'h-1', date: '2026/08/02', completed: true }).success
    ).toBe(false);
  });

  it('accepts dates that match the shape but are not real calendar dates (format-only rule)', () => {
    expect(
      toggleLogSchema.safeParse({ habitId: 'h-1', date: '2026-13-99', completed: true }).success
    ).toBe(true);
  });

  it('rejects a non-boolean completed value', () => {
    expect(
      toggleLogSchema.safeParse({ habitId: 'h-1', date: '2026-08-02', completed: 'yes' }).success
    ).toBe(false);
  });
});
