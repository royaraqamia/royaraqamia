import { describe, it, expect } from 'vitest';
import { HabitWriteSchema, HabitLogWriteSchema } from '@/shared/contracts/habitflow';

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
});
