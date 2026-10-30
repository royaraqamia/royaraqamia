import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { NextRequest, NextResponse } from 'next/server';

const mockResolveSession = vi.fn();
const mockDeleteNote = vi.fn();
const mockCreateNotesService = vi.fn(() => ({ deleteNote: mockDeleteNote }));

vi.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
    redirect: (url: string, status?: number) => ({ url, status: status ?? 307 }),
  },
}));

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/backend/config/identity', async () => {
  const { identityDouble } = await import('@/backend/identity/__tests__/test-double');
  return identityDouble({ session: () => mockResolveSession() });
});

vi.mock('@/backend/config/notes', () => ({
  createNotesService: () => mockCreateNotesService(),
}));

vi.mock('@/backend/config/plans', () => ({
  createPlanGate: () => ({ cap: async () => {} }),
}));

import { DELETE } from '@/app/notes/api/notes/[id]/route';

const NOTE_ID = '11111111-1111-7111-8111-111111111111';
const UPDATED_AT = '2026-10-17T08:30:00.000Z';

/** A request whose body is whatever `json` resolves or rejects with. */
function makeReq(json: () => Promise<unknown>): NextRequest {
  return { json: vi.fn(json), headers: new Headers() } as unknown as NextRequest;
}

function params(id = NOTE_ID) {
  return { params: Promise.resolve({ id }) };
}

function readBody<T>(res: NextResponse): T {
  return (res as unknown as { body: T }).body;
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResolveSession.mockResolvedValue({
    user: { id: 'u-1', email: 'a@b.com' },
    client: {},
  });
  mockDeleteNote.mockResolvedValue(undefined);
});

describe('DELETE /notes/api/notes/:id', () => {
  it('answers 400 for a JSON null body instead of reaching the repository', async () => {
    const res = await DELETE(
      makeReq(async () => null),
      params()
    );

    expect(res.status).toBe(400);
    expect(readBody<{ fieldErrors?: Record<string, string> }>(res).fieldErrors).toHaveProperty(
      'form'
    );
    expect(mockDeleteNote).not.toHaveBeenCalled();
  });

  it('answers 400 for a non-string updatedAt', async () => {
    const res = await DELETE(
      makeReq(async () => ({ updatedAt: 123 })),
      params()
    );

    expect(res.status).toBe(400);
    expect(readBody<{ fieldErrors?: Record<string, string> }>(res).fieldErrors).toHaveProperty(
      'updatedAt'
    );
    expect(mockDeleteNote).not.toHaveBeenCalled();
  });

  it('deletes with no body at all, which carries no write time', async () => {
    const res = await DELETE(
      makeReq(async () => Promise.reject(new Error('no body'))),
      params()
    );

    expect(res.status).toBe(200);
    expect(mockDeleteNote).toHaveBeenCalledWith('u-1', NOTE_ID, {});
  });

  it('passes the replay time the Outbox queued the delete with', async () => {
    const res = await DELETE(
      makeReq(async () => ({ updatedAt: UPDATED_AT })),
      params()
    );

    expect(res.status).toBe(200);
    expect(mockDeleteNote).toHaveBeenCalledWith('u-1', NOTE_ID, { updatedAt: UPDATED_AT });
  });

  it('rejects a non-uuid id before any write', async () => {
    const res = await DELETE(
      makeReq(async () => ({ updatedAt: UPDATED_AT })),
      params('note-1')
    );

    expect(res.status).toBe(400);
    expect(mockDeleteNote).not.toHaveBeenCalled();
  });
});
