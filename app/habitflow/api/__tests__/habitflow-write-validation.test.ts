import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest, NextResponse } from 'next/server';

const mockResolveSession = vi.fn();
const mockService = {
  createHabit: vi.fn(),
  updateHabit: vi.fn(),
  toggleHabitLog: vi.fn(),
  setHabitLogNote: vi.fn(),
  setHabitLogKind: vi.fn(),
};
const mockCreateHabitService = vi.fn(() => ({ service: mockService, mode: 'supabase' as const }));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
    redirect: (url: string, status?: number) => ({ url, status: status ?? 307 }),
  },
}));

vi.mock('@/backend/config/identity', async () => {
  const { identityDouble } = await import('@/backend/identity/__tests__/test-double');
  return identityDouble({ session: () => mockResolveSession() });
});

vi.mock('@/backend/config/habitflow', () => ({
  createHabitService: () => mockCreateHabitService(),
}));

vi.mock('@/backend/config/plans', () => ({
  createPlanGate: () => ({
    cap: async () => {},
    meter: async (_subject: unknown, _action: string, run: () => Promise<unknown>) => run(),
  }),
}));

import { POST as habitsPOST, PUT as habitsPUT } from '@/app/habitflow/api/habits/route';
import { POST as logsPOST } from '@/app/habitflow/api/logs/route';
import { POST as kindPOST } from '@/app/habitflow/api/logs/kind/route';
import { POST as notePOST } from '@/app/habitflow/api/logs/note/route';

const CLIENT_ID = '11111111-1111-4111-8111-111111111111';
const HABIT_ID = '22222222-2222-4222-8222-222222222222';
const UPDATED_AT = '2026-10-17T08:30:00.000Z';

function makeReq(body: unknown): NextRequest {
  return {
    json: vi.fn().mockResolvedValue(body),
    url: 'http://localhost/habitflow/api',
    headers: new Headers(),
  } as unknown as NextRequest;
}

function readBody<T>(res: NextResponse): T {
  return (res as unknown as { body: T }).body;
}

/** The exact payload `HabitLocalStore.createHabit` hands the Outbox. */
const CREATE_INTENT = {
  clientId: CLIENT_ID,
  name: 'قراءة',
  frequency: 'daily',
  target: null,
  targetPeriod: null,
  reminderTime: null,
  updatedAt: UPDATED_AT,
};

/** The `habit.update` payload an undo of an archive emits. */
const UNDO_INTENT = { archived: false, deletedAt: null, id: HABIT_ID, updatedAt: UPDATED_AT };

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveSession.mockResolvedValue({
    user: { id: 'u-1', email: 'a@b.com' },
    client: {},
  });
  mockService.createHabit.mockResolvedValue({ id: HABIT_ID, name: 'قراءة' });
  mockService.updateHabit.mockResolvedValue({ id: HABIT_ID });
  mockService.toggleHabitLog.mockResolvedValue({ id: 'l-1' });
  mockService.setHabitLogNote.mockResolvedValue({ id: 'l-1' });
  mockService.setHabitLogKind.mockResolvedValue({ id: 'l-1' });
});

describe('POST /habitflow/api/habits', () => {
  it('rejects a non-uuid clientId with field errors and never builds the service', async () => {
    const res = await habitsPOST(makeReq({ ...CREATE_INTENT, clientId: 'not-a-uuid' }));

    expect(res.status).toBe(400);
    expect(readBody<{ fieldErrors?: Record<string, string> }>(res).fieldErrors).toHaveProperty(
      'clientId'
    );
    expect(mockCreateHabitService).not.toHaveBeenCalled();
    expect(mockService.createHabit).not.toHaveBeenCalled();
  });

  it('rejects a malformed body (non-JSON) before the service', async () => {
    const res = await habitsPOST(makeReq(null));

    expect(res.status).toBe(400);
    expect(mockService.createHabit).not.toHaveBeenCalled();
  });

  it('accepts the Outbox create payload', async () => {
    const res = await habitsPOST(makeReq(CREATE_INTENT));

    expect(res.status).toBe(201);
    expect(mockService.createHabit).toHaveBeenCalledWith(CREATE_INTENT);
  });

  it('accepts a replayed create intent, so an offline create converges', async () => {
    await habitsPOST(makeReq(CREATE_INTENT));
    const replay = await habitsPOST(makeReq(CREATE_INTENT));

    expect(replay.status).toBe(201);
    expect(mockService.createHabit).toHaveBeenNthCalledWith(2, CREATE_INTENT);
  });
});

describe('PUT /habitflow/api/habits', () => {
  it('rejects a non-uuid id', async () => {
    const res = await habitsPUT(makeReq({ id: 'habit-1', name: 'قراءة' }));

    expect(res.status).toBe(400);
    expect(readBody<{ fieldErrors?: Record<string, string> }>(res).fieldErrors).toHaveProperty(
      'id'
    );
    expect(mockService.updateHabit).not.toHaveBeenCalled();
  });

  it('rejects a malformed reminder time', async () => {
    const res = await habitsPUT(makeReq({ id: HABIT_ID, reminderTime: '25:00' }));

    expect(res.status).toBe(400);
    expect(mockService.updateHabit).not.toHaveBeenCalled();
  });

  it('accepts the edit payload', async () => {
    const body = {
      id: HABIT_ID,
      name: 'رياضة',
      frequency: 'weekly',
      target: 3,
      targetPeriod: 'week',
    };
    const res = await habitsPUT(makeReq(body));

    expect(res.status).toBe(200);
    expect(mockService.updateHabit).toHaveBeenCalledWith(HABIT_ID, {
      name: 'رياضة',
      frequency: 'weekly',
      target: 3,
      targetPeriod: 'week',
    });
  });

  it('accepts the undo payload that clears a tombstone', async () => {
    const res = await habitsPUT(makeReq(UNDO_INTENT));

    expect(res.status).toBe(200);
    expect(mockService.updateHabit).toHaveBeenCalledWith(HABIT_ID, {
      archived: false,
      deletedAt: null,
      updatedAt: UPDATED_AT,
    });
  });
});

describe('POST /habitflow/api/logs', () => {
  const TOGGLE_INTENT = {
    habitId: HABIT_ID,
    date: '2026-10-17',
    completed: true,
    clientId: CLIENT_ID,
    updatedAt: UPDATED_AT,
  };

  it('rejects a non-ISO date', async () => {
    const res = await logsPOST(makeReq({ ...TOGGLE_INTENT, date: '17/10/2026' }));

    expect(res.status).toBe(400);
    expect(readBody<{ fieldErrors?: Record<string, string> }>(res).fieldErrors).toHaveProperty(
      'date'
    );
    expect(mockService.toggleHabitLog).not.toHaveBeenCalled();
  });

  it('accepts the Outbox toggle payload', async () => {
    const res = await logsPOST(makeReq(TOGGLE_INTENT));

    expect(res.status).toBe(200);
    expect(mockService.toggleHabitLog).toHaveBeenCalledWith(TOGGLE_INTENT);
  });
});

describe('POST /habitflow/api/logs/kind', () => {
  const KIND_INTENT = {
    habitId: HABIT_ID,
    date: '2026-10-17',
    kind: 'skip',
    clientId: CLIENT_ID,
    updatedAt: UPDATED_AT,
  };

  it('rejects an unknown kind', async () => {
    const res = await kindPOST(makeReq({ ...KIND_INTENT, kind: 'whatever' }));

    expect(res.status).toBe(400);
    expect(readBody<{ fieldErrors?: Record<string, string> }>(res).fieldErrors).toHaveProperty(
      'kind'
    );
    expect(mockService.setHabitLogKind).not.toHaveBeenCalled();
  });

  it('accepts the Outbox kind payload', async () => {
    const res = await kindPOST(makeReq(KIND_INTENT));

    expect(res.status).toBe(200);
    expect(mockService.setHabitLogKind).toHaveBeenCalledWith(KIND_INTENT);
  });
});

describe('POST /habitflow/api/logs/note', () => {
  const NOTE_INTENT = {
    habitId: HABIT_ID,
    date: '2026-10-17',
    note: 'يوم جيد',
    clientId: CLIENT_ID,
    updatedAt: UPDATED_AT,
  };

  it('rejects a note over the 500-character bound', async () => {
    const res = await notePOST(makeReq({ ...NOTE_INTENT, note: 'x'.repeat(501) }));

    expect(res.status).toBe(400);
    expect(readBody<{ fieldErrors?: Record<string, string> }>(res).fieldErrors).toHaveProperty(
      'note'
    );
    expect(mockService.setHabitLogNote).not.toHaveBeenCalled();
  });

  it('accepts the Outbox note payload', async () => {
    const res = await notePOST(makeReq(NOTE_INTENT));

    expect(res.status).toBe(200);
    expect(mockService.setHabitLogNote).toHaveBeenCalledWith(NOTE_INTENT);
  });
});
