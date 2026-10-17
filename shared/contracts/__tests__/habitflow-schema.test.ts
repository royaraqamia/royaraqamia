import { describe, it, expect } from 'vitest';
import {
  HabitLogKindWriteSchema,
  HabitLogNoteWriteSchema,
  HabitLogWriteSchema,
  HabitUpdateSchema,
  HabitWriteSchema,
} from '@/shared/contracts/habitflow';

const clientId = '11111111-1111-4111-8111-111111111111';
const habitId = '22222222-2222-4222-8222-222222222222';

describe('HabitWriteSchema', () => {
  const base = { clientId, name: 'قراءة' };

  it('accepts a minimal payload', () => {
    expect(HabitWriteSchema.safeParse(base).success).toBe(true);
  });

  it('requires a uuid client id', () => {
    expect(HabitWriteSchema.safeParse({ ...base, clientId: 'not-a-uuid' }).success).toBe(false);
  });

  it('rejects an empty name', () => {
    expect(HabitWriteSchema.safeParse({ ...base, name: '   ' }).success).toBe(false);
  });

  it('validates the reminder time format', () => {
    expect(HabitWriteSchema.safeParse({ ...base, reminderTime: '21:30' }).success).toBe(true);
    expect(HabitWriteSchema.safeParse({ ...base, reminderTime: '25:00' }).success).toBe(false);
  });

  it('accepts the client write time that drives LWW', () => {
    expect(
      HabitWriteSchema.safeParse({ ...base, updatedAt: '2026-08-02T10:00:00.000Z' }).success
    ).toBe(true);
    expect(HabitWriteSchema.safeParse({ ...base, updatedAt: 'not-a-date' }).success).toBe(false);
  });
});

describe('HabitLogWriteSchema', () => {
  const base = { clientId, habitId, date: '2026-08-02', completed: true };

  it('accepts a valid log write', () => {
    expect(HabitLogWriteSchema.safeParse(base).success).toBe(true);
  });

  it('rejects a non-ISO date', () => {
    expect(HabitLogWriteSchema.safeParse({ ...base, date: '02/08/2026' }).success).toBe(false);
  });

  it('rejects an unknown kind', () => {
    expect(HabitLogWriteSchema.safeParse({ ...base, kind: 'whatever' }).success).toBe(false);
  });

  it('accepts the client write time that drives LWW', () => {
    expect(
      HabitLogWriteSchema.safeParse({ ...base, updatedAt: '2026-08-02T10:00:00.000Z' }).success
    ).toBe(true);
    expect(HabitLogWriteSchema.safeParse({ ...base, updatedAt: 'not-a-date' }).success).toBe(false);
  });
});

describe('HabitUpdateSchema', () => {
  it('accepts the edit payload keyed on the row id', () => {
    const payload = { id: clientId, name: 'رياضة', frequency: 'weekly', target: 3 };

    expect(HabitUpdateSchema.safeParse(payload).success).toBe(true);
  });

  it('accepts the undo payload that clears a tombstone', () => {
    expect(
      HabitUpdateSchema.safeParse({ id: clientId, archived: false, deletedAt: null }).success
    ).toBe(true);
  });

  it('requires a uuid id', () => {
    expect(HabitUpdateSchema.safeParse({ name: 'رياضة' }).success).toBe(false);
    expect(HabitUpdateSchema.safeParse({ id: 'habit-1' }).success).toBe(false);
  });
});

describe('HabitLogKindWriteSchema', () => {
  const base = { clientId, habitId, date: '2026-08-02', kind: 'skip' };

  it('accepts a kind without completed', () => {
    expect(HabitLogKindWriteSchema.safeParse(base).success).toBe(true);
  });

  it('requires the kind', () => {
    expect(HabitLogKindWriteSchema.safeParse({ ...base, kind: undefined }).success).toBe(false);
  });

  it('rejects an unknown kind', () => {
    expect(HabitLogKindWriteSchema.safeParse({ ...base, kind: 'whatever' }).success).toBe(false);
  });
});

describe('HabitLogNoteWriteSchema', () => {
  const base = { clientId, habitId, date: '2026-08-02', note: 'يوم جيد' };

  it('accepts a note without completed', () => {
    expect(HabitLogNoteWriteSchema.safeParse(base).success).toBe(true);
  });

  it('accepts clearing the note with null', () => {
    expect(HabitLogNoteWriteSchema.safeParse({ ...base, note: null }).success).toBe(true);
  });

  it('bounds the note at 500 characters', () => {
    expect(HabitLogNoteWriteSchema.safeParse({ ...base, note: 'x'.repeat(500) }).success).toBe(
      true
    );
    expect(HabitLogNoteWriteSchema.safeParse({ ...base, note: 'x'.repeat(501) }).success).toBe(
      false
    );
  });
});
