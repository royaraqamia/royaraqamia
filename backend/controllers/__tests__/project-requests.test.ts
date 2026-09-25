import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSubmit = vi.fn();
const mockGetOptionalUser = vi.fn();

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/backend/config/project-requests', () => ({
  createDefaultProjectRequestService: () => ({ submit: mockSubmit }),
}));

vi.mock('@/backend/middleware/auth-guard', () => ({
  getOptionalUser: () => mockGetOptionalUser(),
}));

import { submitProjectRequest } from '@/backend/controllers/project-requests';
import { ProjectRequestRateLimitError } from '@/backend/services/project-requests/project-requests-service';

const VALID_BODY = {
  full_name: 'أحمد العلي',
  phone_whatsapp: '+963 968 478 904',
  project_type: 'website',
  description: 'أريد متجرًا إلكترونيًّا يعرض المنتجات ويتيح الطَّلب عبر واتساب.',
};

const REQUEST = { id: 'req-1', reference_code: 'PRJ-2026-A7K2M9QX' };

describe('project requests controller: submitProjectRequest', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOptionalUser.mockResolvedValue({ user: null, client: null });
    mockSubmit.mockResolvedValue(REQUEST);
  });

  it('rejects an invalid body with field errors and never calls the service', async () => {
    const result = await submitProjectRequest({ ...VALID_BODY, phone_whatsapp: 'nope' }, '1.1.1.1');

    expect(result).toMatchObject({
      status: 400,
      body: { success: false, fieldErrors: { phone_whatsapp: 'رقم واتساب غير صحيح' } },
    });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('returns the reference code on success', async () => {
    const result = await submitProjectRequest(VALID_BODY, '1.1.1.1');

    expect(result).toMatchObject({
      status: 200,
      body: { success: true, referenceCode: 'PRJ-2026-A7K2M9QX' },
    });
  });

  it('attributes an anonymous submission to no user', async () => {
    await submitProjectRequest(VALID_BODY, '1.1.1.1');

    expect(mockSubmit).toHaveBeenCalledWith(expect.anything(), { ip: '1.1.1.1', userId: null });
  });

  it('attributes a signed-in submission to the session user', async () => {
    mockGetOptionalUser.mockResolvedValue({ user: { id: 'user-9' }, client: {} });

    await submitProjectRequest(VALID_BODY, '1.1.1.1');

    expect(mockSubmit).toHaveBeenCalledWith(expect.anything(), { ip: '1.1.1.1', userId: 'user-9' });
  });

  it('maps a rate limit rejection to 429', async () => {
    mockSubmit.mockRejectedValue(new ProjectRequestRateLimitError());

    const result = await submitProjectRequest(VALID_BODY, '1.1.1.1');

    expect(result).toMatchObject({ status: 429, body: { success: false } });
  });

  it('maps an unexpected failure to 500 without leaking the cause', async () => {
    mockSubmit.mockRejectedValue(new Error('connection reset by peer'));

    const result = await submitProjectRequest(VALID_BODY, '1.1.1.1');

    expect(result).toMatchObject({ status: 500 });
    expect(JSON.stringify(result)).not.toContain('connection reset');
  });
});
