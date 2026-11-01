import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockList = vi.fn();
const mockReplace = vi.fn();
const mockGetAuthUser = vi.fn();
const mockCheckRateLimit = vi.fn();

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/backend/config/identity', async () => {
  const { identityDouble } = await import('@/backend/identity/__tests__/test-double');
  return identityDouble({ session: async () => mockGetAuthUser() });
});

vi.mock('@/backend/config/users', () => ({
  createHiddenServicesService: () => ({
    list: (...args: unknown[]) => mockList(...args),
    replace: (...args: unknown[]) => mockReplace(...args),
  }),
}));

vi.mock('@/backend/middleware/http', () => ({
  checkRateLimitApi: (...args: unknown[]) => mockCheckRateLimit(...args),
}));

import { listHiddenServices, replaceHiddenServices } from '@/backend/controllers/hidden-services';

const SAME_ORIGIN = new Headers({ 'sec-fetch-site': 'same-origin' });
const CROSS_SITE = new Headers({ 'sec-fetch-site': 'cross-site' });

const SESSION = { user: { id: 'user-1', email: 'user@example.com' }, client: {} };
const SIGNED_OUT = { user: null, client: {} };

describe('hidden-services controller: listHiddenServices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUser.mockResolvedValue(SESSION);
    mockCheckRateLimit.mockResolvedValue(null);
    mockList.mockResolvedValue(['/quran']);
  });

  it('answers the signed-in user’s hidden routes', async () => {
    const result = await listHiddenServices();

    expect(result).toMatchObject({
      status: 200,
      body: { success: true, data: ['/quran'] },
    });
    expect(mockList).toHaveBeenCalledWith('user-1');
  });

  it('answers 401 when signed out and never reaches the service', async () => {
    mockGetAuthUser.mockResolvedValue(SIGNED_OUT);

    const result = await listHiddenServices();

    expect(result).toMatchObject({ status: 401 });
    expect(mockList).not.toHaveBeenCalled();
  });

  it('answers a readable failure when the read throws', async () => {
    mockList.mockRejectedValue(new Error('db down'));

    const result = await listHiddenServices();

    expect(result).toMatchObject({ status: 500, body: { success: false } });
  });
});

describe('hidden-services controller: replaceHiddenServices', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAuthUser.mockResolvedValue(SESSION);
    mockCheckRateLimit.mockResolvedValue(null);
    mockReplace.mockImplementation((_userId: string, hidden: string[]) => Promise.resolve(hidden));
  });

  it('replaces the set and echoes what is hidden', async () => {
    const result = await replaceHiddenServices({ hidden: ['/quran', '/athkar'] }, SAME_ORIGIN);

    expect(result).toMatchObject({
      status: 200,
      body: { success: true, data: ['/quran', '/athkar'] },
    });
    expect(mockReplace).toHaveBeenCalledWith('user-1', ['/quran', '/athkar']);
  });

  it('refuses a cross-site write before touching the service', async () => {
    const result = await replaceHiddenServices({ hidden: [] }, CROSS_SITE);

    expect(result).toMatchObject({ status: 403 });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('refuses a route outside the catalog', async () => {
    const result = await replaceHiddenServices({ hidden: ['/admin'] }, SAME_ORIGIN);

    expect(result).toMatchObject({ status: 400, body: { success: false } });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('refuses a body that is not a list', async () => {
    const result = await replaceHiddenServices({ hidden: 'quran' }, SAME_ORIGIN);

    expect(result).toMatchObject({ status: 400 });
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('answers the limiter’s refusal without writing', async () => {
    mockCheckRateLimit.mockResolvedValue({ status: 429, body: { success: false } });

    const result = await replaceHiddenServices({ hidden: [] }, SAME_ORIGIN);

    expect(result).toMatchObject({ status: 429 });
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
