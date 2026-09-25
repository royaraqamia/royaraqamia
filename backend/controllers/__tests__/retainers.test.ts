import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSubmit = vi.fn();
const mockGetOptionalUser = vi.fn();

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/backend/config/retainers', () => ({
  createDefaultRetainerService: () => ({ submit: mockSubmit }),
}));

vi.mock('@/backend/middleware/auth-guard', () => ({
  getOptionalUser: () => mockGetOptionalUser(),
}));

import { submitRetainer } from '@/backend/controllers/retainers';
import { RetainerRateLimitError } from '@/backend/services/retainers/retainers-service';

const VALID_BODY = {
  full_name: 'أحمد العلي',
  phone_whatsapp: '+963 968 478 904',
  current_projects: 'متجر إلكترونيّ على ووردبريس، وموقع تعريفيّ لشركة صغيرة.',
  needs: 'صيانة دوريَّة، إصلاح الأعطال، وإضافة ميزات جديدة كلَّ شهر.',
};

const RETAINER = { id: 'ret-1', reference_code: 'RET-2026-A7K2M9QX' };

describe('retainers controller: submitRetainer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOptionalUser.mockResolvedValue({ user: null, client: null });
    mockSubmit.mockResolvedValue(RETAINER);
  });

  it('rejects an invalid body with field errors and never calls the service', async () => {
    const result = await submitRetainer({ ...VALID_BODY, phone_whatsapp: 'nope' }, '1.1.1.1');

    expect(result).toMatchObject({
      status: 400,
      body: { success: false, fieldErrors: { phone_whatsapp: 'رقم واتساب غير صحيح' } },
    });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('returns the reference code on success', async () => {
    const result = await submitRetainer(VALID_BODY, '1.1.1.1');

    expect(result).toMatchObject({
      status: 200,
      body: { success: true, referenceCode: 'RET-2026-A7K2M9QX' },
    });
  });

  it('attributes an anonymous submission to no user', async () => {
    await submitRetainer(VALID_BODY, '1.1.1.1');

    expect(mockSubmit).toHaveBeenCalledWith(expect.anything(), { ip: '1.1.1.1', userId: null });
  });

  it('attributes a signed-in submission to the session user', async () => {
    mockGetOptionalUser.mockResolvedValue({ user: { id: 'user-9' }, client: {} });

    await submitRetainer(VALID_BODY, '1.1.1.1');

    expect(mockSubmit).toHaveBeenCalledWith(expect.anything(), { ip: '1.1.1.1', userId: 'user-9' });
  });

  it('maps a rate limit rejection to 429', async () => {
    mockSubmit.mockRejectedValue(new RetainerRateLimitError());

    const result = await submitRetainer(VALID_BODY, '1.1.1.1');

    expect(result).toMatchObject({ status: 429, body: { success: false } });
  });

  it('maps an unexpected failure to 500 without leaking the cause', async () => {
    mockSubmit.mockRejectedValue(new Error('connection reset by peer'));

    const result = await submitRetainer(VALID_BODY, '1.1.1.1');

    expect(result).toMatchObject({ status: 500 });
    expect(JSON.stringify(result)).not.toContain('connection reset');
  });
});
