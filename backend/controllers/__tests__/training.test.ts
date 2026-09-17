import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockSubmit = vi.fn();
const mockList = vi.fn();
const mockUpdate = vi.fn();
const mockGetOptionalUser = vi.fn();
const mockRequireAdminAuth = vi.fn();

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

vi.mock('@/backend/middleware/auth-guard', () => ({
  getOptionalUser: () => mockGetOptionalUser(),
}));

vi.mock('@/backend/middleware/admin-auth-guard', () => ({
  requireAdminAuth: () => mockRequireAdminAuth(),
}));

vi.mock('@/backend/config/training', () => ({
  createDefaultTrainingApplicationService: () => ({
    submit: mockSubmit,
    list: mockList,
    update: mockUpdate,
  }),
}));

import {
  listTrainingApplications,
  submitTrainingApplication,
  updateTrainingApplication,
} from '@/backend/controllers/training';
import {
  TrainingApplicationClosedError,
  TrainingApplicationNotFoundError,
  TrainingApplicationRateLimitError,
} from '@/backend/services/training/training-application-service';

const VALID_BODY = {
  course_slug: 'build-digital-products',
  full_name: 'أحمد العلي',
  phone_whatsapp: '+963 968 478 904',
};

const APPLICATION = {
  id: 'app-1',
  reference_code: 'TRN-2026-A7K2M9QX',
  status: 'new',
};

describe('training controller: submitTrainingApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetOptionalUser.mockResolvedValue({ user: null, client: null });
    mockSubmit.mockResolvedValue(APPLICATION);
    mockRequireAdminAuth.mockResolvedValue(undefined);
    mockList.mockResolvedValue({ data: [], total: 0 });
    mockUpdate.mockResolvedValue(APPLICATION);
  });

  it('rejects an invalid body with field errors and never calls the service', async () => {
    const result = await submitTrainingApplication(
      { ...VALID_BODY, phone_whatsapp: 'nope' },
      '1.1.1.1'
    );

    expect(result).toMatchObject({
      status: 400,
      body: { success: false, fieldErrors: { phone_whatsapp: 'رقم واتساب غير صحيح' } },
    });
    expect(mockSubmit).not.toHaveBeenCalled();
  });

  it('returns the reference code on success', async () => {
    const result = await submitTrainingApplication(VALID_BODY, '1.1.1.1');

    expect(result).toMatchObject({
      status: 200,
      body: { success: true, referenceCode: 'TRN-2026-A7K2M9QX' },
    });
  });

  it('attributes an anonymous submission to no user', async () => {
    await submitTrainingApplication(VALID_BODY, '1.1.1.1');

    expect(mockSubmit).toHaveBeenCalledWith(expect.anything(), { ip: '1.1.1.1', userId: null });
  });

  it('attributes a signed-in submission to the session user', async () => {
    mockGetOptionalUser.mockResolvedValue({ user: { id: 'user-9' }, client: {} });

    await submitTrainingApplication(VALID_BODY, '1.1.1.1');

    expect(mockSubmit).toHaveBeenCalledWith(expect.anything(), { ip: '1.1.1.1', userId: 'user-9' });
  });

  it('maps a closed course to 400', async () => {
    mockSubmit.mockRejectedValue(new TrainingApplicationClosedError());

    const result = await submitTrainingApplication(VALID_BODY, '1.1.1.1');

    expect(result).toMatchObject({ status: 400, body: { success: false } });
  });

  it('maps a rate limit rejection to 429', async () => {
    mockSubmit.mockRejectedValue(new TrainingApplicationRateLimitError());

    const result = await submitTrainingApplication(VALID_BODY, '1.1.1.1');

    expect(result).toMatchObject({ status: 429, body: { success: false } });
  });

  it('maps an unexpected failure to 500 without leaking the cause', async () => {
    mockSubmit.mockRejectedValue(new Error('connection reset by peer'));

    const result = await submitTrainingApplication(VALID_BODY, '1.1.1.1');

    expect(result).toMatchObject({ status: 500 });
    expect(JSON.stringify(result)).not.toContain('connection reset');
  });
});

describe('training controller: listTrainingApplications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminAuth.mockResolvedValue(undefined);
    mockList.mockResolvedValue({ data: [APPLICATION], total: 1 });
  });

  it('returns rows for an admin', async () => {
    const result = await listTrainingApplications(1, 20);

    expect(result).toMatchObject({ status: 200, body: { total: 1 } });
  });

  it('refuses a non-admin without querying', async () => {
    mockRequireAdminAuth.mockRejectedValue(new Error('FORBIDDEN'));

    const result = await listTrainingApplications(1, 20);

    expect(result).toMatchObject({ status: 500, body: { data: [], total: 0 } });
    expect(mockList).not.toHaveBeenCalled();
  });

  it('passes a known status filter through', async () => {
    await listTrainingApplications(1, 20, 'contacted');

    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ status: 'contacted' }));
  });

  it('drops an unknown status filter instead of failing', async () => {
    await listTrainingApplications(1, 20, 'archived');

    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ status: undefined }));
  });

  it('clamps a hostile page size', async () => {
    await listTrainingApplications(1, 100000);

    expect(mockList).toHaveBeenCalledWith(expect.objectContaining({ pageSize: 100 }));
  });
});

describe('training controller: updateTrainingApplication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdminAuth.mockResolvedValue(undefined);
    mockUpdate.mockResolvedValue(APPLICATION);
  });

  it('rejects an unknown status', async () => {
    const result = await updateTrainingApplication('app-1', { status: 'archived' });

    expect(result).toMatchObject({ status: 400, body: { success: false } });
    expect(mockUpdate).not.toHaveBeenCalled();
  });

  it('returns the updated row', async () => {
    const result = await updateTrainingApplication('app-1', { status: 'contacted' });

    expect(result).toMatchObject({ status: 200, body: { success: true } });
  });

  it('maps a missing application to 404', async () => {
    mockUpdate.mockRejectedValue(new TrainingApplicationNotFoundError());

    const result = await updateTrainingApplication('missing', { status: 'contacted' });

    expect(result).toMatchObject({ status: 404, body: { success: false } });
  });
});
