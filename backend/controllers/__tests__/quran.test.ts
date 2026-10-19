import { beforeEach, describe, expect, it, vi } from 'vitest';

const mockGetAuthUser = vi.fn();
const mockService = {
  getSyncSnapshot: vi.fn(),
  saveReadingPosition: vi.fn(),
  setBookmark: vi.fn(),
};

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/backend/config/identity', async () => {
  const { identityDouble } = await import('@/backend/identity/__tests__/test-double');
  return identityDouble({
    session: async () => {
      const { user, supabase } = await mockGetAuthUser();
      return { user, client: supabase };
    },
  });
});

vi.mock('@/backend/config/quran', () => ({
  createQuranSyncService: () => mockService,
}));

import { RepositoryError } from '@/backend/shared/repository-error';
import {
  saveQuranBookmark,
  saveQuranReadingPosition,
  syncQuran,
} from '@/backend/controllers/quran';

const CLIENT_ID = '11111111-1111-7111-8111-111111111111';

describe('quran controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUser.mockResolvedValue({
      user: { id: 'u-1', email: 'a@b.com' },
      supabase: {},
    });
    mockService.getSyncSnapshot.mockResolvedValue({ position: null, bookmarks: [], cursor: null });
    mockService.saveReadingPosition.mockResolvedValue(undefined);
    mockService.setBookmark.mockResolvedValue(undefined);
  });

  it('answers 401 without a session, so reading stays anonymous', async () => {
    mockGetAuthUser.mockResolvedValue({ user: null, supabase: {} });

    const result = await syncQuran(new URLSearchParams());

    expect(result).toEqual(expect.objectContaining({ status: 401, body: { error: 'غير مصرح' } }));
    expect(mockService.getSyncSnapshot).not.toHaveBeenCalled();
  });

  it('passes the device cursor through and returns the snapshot', async () => {
    const snapshot = {
      position: { surah: 2, ayah: 5, updatedAt: '2026-10-05T00:00:00.000Z' },
      bookmarks: [],
      cursor: '2026-10-05T00:00:01.000Z',
    };
    mockService.getSyncSnapshot.mockResolvedValue(snapshot);

    const result = await syncQuran(new URLSearchParams({ since: '2026-10-01T00:00:00.000Z' }));

    expect(result).toEqual(expect.objectContaining({ status: 200, body: snapshot }));
    expect(mockService.getSyncSnapshot).toHaveBeenCalledWith('u-1', '2026-10-01T00:00:00.000Z');
  });

  it('scopes a position write to the session user and carries its write metadata', async () => {
    const result = await saveQuranReadingPosition({
      surah: 2,
      ayah: 5,
      clientId: CLIENT_ID,
      updatedAt: '2026-10-05T00:00:00.000Z',
    });

    expect(result).toEqual(expect.objectContaining({ status: 200, body: { success: true } }));
    expect(mockService.saveReadingPosition).toHaveBeenCalledWith(
      'u-1',
      { surah: 2, ayah: 5 },
      { clientId: CLIENT_ID, updatedAt: '2026-10-05T00:00:00.000Z' }
    );
  });

  it('carries a bookmark tombstone as a tombstone, not as an absent field', async () => {
    await saveQuranBookmark({
      surah: 2,
      ayah: 255,
      deletedAt: '2026-10-06T00:00:00.000Z',
      clientId: CLIENT_ID,
      updatedAt: '2026-10-06T00:00:00.000Z',
    });

    expect(mockService.setBookmark).toHaveBeenCalledWith(
      'u-1',
      { surah: 2, ayah: 255, deletedAt: '2026-10-06T00:00:00.000Z' },
      { clientId: CLIENT_ID, updatedAt: '2026-10-06T00:00:00.000Z' }
    );
  });

  it('marks an Ayah when the write carries no tombstone at all', async () => {
    await saveQuranBookmark({ surah: 2, ayah: 255, clientId: CLIENT_ID });

    expect(mockService.setBookmark).toHaveBeenCalledWith(
      'u-1',
      { surah: 2, ayah: 255, deletedAt: null },
      { clientId: CLIENT_ID, updatedAt: undefined }
    );
  });

  it('answers 500 for a data-access failure, so the Outbox retries instead of failing it', async () => {
    mockService.setBookmark.mockRejectedValue(
      new RepositoryError('setBookmark', new Error('connection reset'))
    );

    const result = await saveQuranBookmark({ surah: 2, ayah: 255, clientId: CLIENT_ID });

    expect(result).toEqual(expect.objectContaining({ status: 500 }));
  });
});
