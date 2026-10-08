import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockGetAuthUser = vi.fn();
const mockSyncAdminAllowlistMirror = vi.fn();

const mockListJobs = vi.fn();
const mockListBlocklist = vi.fn();
const mockAddBlock = vi.fn();
const mockRemoveBlock = vi.fn();
const mockListPlatforms = vi.fn();
const mockSetPlatformEnabled = vi.fn();
const mockGetSettings = vi.fn();
const mockUpdateSettings = vi.fn();

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/backend/config/admin-allowlist', () => ({
  syncAdminAllowlistMirror: (emails: string[]) => mockSyncAdminAllowlistMirror(emails),
}));

vi.mock('@/backend/config/identity', async () => {
  const { identityDouble } = await import('@/backend/identity/__tests__/test-double');
  return identityDouble({
    session: async () => ({ user: null, client: null }),
    admin: async () => {
      const { user, client } = await mockGetAuthUser();
      if (!user) return { kind: 'anonymous' };
      if (user.email !== 'admin@example.com') return { kind: 'forbidden' };
      await mockSyncAdminAllowlistMirror(['admin@example.com']);
      return { kind: 'admin', identity: { user, client } };
    },
  });
});

vi.mock('@/backend/config/downloader', () => ({
  createDownloaderAdminService: () => ({
    listJobs: mockListJobs,
    listBlocklist: mockListBlocklist,
    addBlock: mockAddBlock,
    removeBlock: mockRemoveBlock,
    listPlatforms: mockListPlatforms,
    setPlatformEnabled: mockSetPlatformEnabled,
    getSettings: mockGetSettings,
    updateSettings: mockUpdateSettings,
  }),
}));

import {
  addDownloadBlock,
  getDownloaderSettings,
  listDownloadJobs,
  listDownloadPlatforms,
  removeDownloadBlock,
  setDownloadPlatformEnabled,
  updateDownloaderSettings,
} from '@/backend/controllers/downloader-admin';

const ADMIN_SESSION = { user: { id: 'admin-1', email: 'admin@example.com' }, client: {} };
const NON_ADMIN_SESSION = { user: { id: 'user-2', email: 'user@example.com' }, client: {} };
const SIGNED_OUT = { user: null, client: {} };

const PAGE = { jobs: [], total: 0, page: 1, pageSize: 20 };
const SETTINGS = {
  maxDurationSeconds: 900,
  maxAudioBytes: 52428800,
  maxVideoBytes: 209715200,
  maxConcurrentJobs: 20,
  linkTtlSeconds: 300,
};
const BLOCK_ID = '11111111-1111-4111-8111-111111111111';

beforeEach(() => {
  vi.clearAllMocks();
  mockGetAuthUser.mockResolvedValue(ADMIN_SESSION);
  mockSyncAdminAllowlistMirror.mockResolvedValue(undefined);
  mockListJobs.mockResolvedValue(PAGE);
  mockListBlocklist.mockResolvedValue([]);
  mockAddBlock.mockResolvedValue({
    id: BLOCK_ID,
    kind: 'domain',
    value: 'example.com',
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'admin@example.com',
  });
  mockRemoveBlock.mockResolvedValue(undefined);
  mockListPlatforms.mockResolvedValue([]);
  mockSetPlatformEnabled.mockResolvedValue(null);
  mockGetSettings.mockResolvedValue(SETTINGS);
  mockUpdateSettings.mockResolvedValue(SETTINGS);
});

describe('admin downloader endpoints are admin-gated', () => {
  it('answers 401 when signed out and never touches the service', async () => {
    mockGetAuthUser.mockResolvedValue(SIGNED_OUT);

    const result = await listDownloadJobs({});

    expect(result.status).toBe(401);
    expect(mockListJobs).not.toHaveBeenCalled();
  });

  it('answers 403 for a signed-in non-admin', async () => {
    mockGetAuthUser.mockResolvedValue(NON_ADMIN_SESSION);

    const result = await listDownloadPlatforms();

    expect(result.status).toBe(403);
    expect(mockListPlatforms).not.toHaveBeenCalled();
  });
});

describe('listDownloadJobs', () => {
  it('returns the page for an admin', async () => {
    const result = await listDownloadJobs({ page: 2, pageSize: 10, status: 'failed', search: 'x' });

    expect(result.status).toBe(200);
    expect(mockListJobs).toHaveBeenCalledWith({
      page: 2,
      pageSize: 10,
      status: 'failed',
      search: 'x',
    });
  });

  it('drops an unknown status and clamps the page size', async () => {
    await listDownloadJobs({ page: 0, pageSize: 100000, status: 'bogus' });

    expect(mockListJobs).toHaveBeenCalledWith({
      page: 1,
      pageSize: 100,
      status: undefined,
      search: undefined,
    });
  });

  it('answers a readable 500 when the service throws', async () => {
    mockListJobs.mockRejectedValue(new Error('db down'));

    const result = await listDownloadJobs({});

    expect(result).toMatchObject({
      status: 500,
      body: { success: false, error: 'تعذّر تحميل طلبات التنزيل.' },
    });
  });
});

describe('addDownloadBlock', () => {
  it('rejects an invalid value with field errors', async () => {
    const result = await addDownloadBlock({ kind: 'domain', value: 'not a domain' });

    expect(result.status).toBe(400);
    expect(mockAddBlock).not.toHaveBeenCalled();
  });

  it('creates the entry with the admin email as author', async () => {
    const result = await addDownloadBlock({ kind: 'domain', value: 'example.com' });

    expect(result.status).toBe(201);
    expect(mockAddBlock).toHaveBeenCalledWith({
      kind: 'domain',
      value: 'example.com',
      createdBy: 'admin@example.com',
    });
  });

  it('maps a duplicate to 409', async () => {
    mockAddBlock.mockRejectedValue({ code: '23505' });

    const result = await addDownloadBlock({ kind: 'domain', value: 'example.com' });

    expect(result.status).toBe(409);
  });
});

describe('removeDownloadBlock', () => {
  it('rejects a non-uuid id', async () => {
    const result = await removeDownloadBlock('nope');

    expect(result.status).toBe(400);
    expect(mockRemoveBlock).not.toHaveBeenCalled();
  });

  it('removes a valid entry', async () => {
    const result = await removeDownloadBlock(BLOCK_ID);

    expect(result.status).toBe(200);
    expect(mockRemoveBlock).toHaveBeenCalledWith(BLOCK_ID);
  });
});

describe('setDownloadPlatformEnabled', () => {
  it('answers 404 for an unknown Platform', async () => {
    const result = await setDownloadPlatformEnabled('nope', { enabled: false });

    expect(result.status).toBe(404);
  });

  it('returns the updated Platform', async () => {
    mockSetPlatformEnabled.mockResolvedValue({
      id: 'youtube',
      name: 'YouTube',
      domains: ['youtube.com'],
      enabled: false,
      enabledByDefault: true,
      consecutiveFailures: 0,
      openUntil: null,
      breakerOpen: false,
    });

    const result = await setDownloadPlatformEnabled('youtube', { enabled: false });

    expect(result.status).toBe(200);
    expect(mockSetPlatformEnabled).toHaveBeenCalledWith('youtube', false);
  });
});

describe('settings endpoints', () => {
  it('returns the current settings', async () => {
    const result = await getDownloaderSettings();

    expect(result.status).toBe(200);
  });

  it('rejects an empty settings update', async () => {
    const result = await updateDownloaderSettings({});

    expect(result.status).toBe(400);
    expect(mockUpdateSettings).not.toHaveBeenCalled();
  });

  it('applies a valid settings update', async () => {
    const result = await updateDownloaderSettings({ maxConcurrentJobs: 5 });

    expect(result.status).toBe(200);
    expect(mockUpdateSettings).toHaveBeenCalledWith({ maxConcurrentJobs: 5 });
  });
});
