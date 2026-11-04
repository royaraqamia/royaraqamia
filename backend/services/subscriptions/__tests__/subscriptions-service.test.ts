import { describe, it, expect, vi } from 'vitest';
import type {
  SubscriptionRequestCreateInput,
  SubscriptionRequestUpdate,
} from '@/backend/repositories/subscriptions/subscriptions-repository';
import {
  SubscriptionRequestNotFoundError,
  SubscriptionRequestRateLimitError,
  SubscriptionRequestService,
  type SubscriptionRequestServiceDeps,
} from '@/backend/services/subscriptions/subscriptions-service';
import type {
  SubscriptionRequest,
  SubscriptionRequestInput,
} from '@/shared/contracts/subscriptions';

const REFERENCE = 'SUB-2026-A7K2M9QX';

const VALID_INPUT: SubscriptionRequestInput = {
  full_name: 'أحمد الحسن',
  phone_whatsapp: '+963 968 478 904',
  email: 'ahmad@example.com',
  note: 'مشروعان صغيران وأحتاج مساعدًا يوميًّا.',
};

function makeRow(overrides: Partial<SubscriptionRequest> = {}): SubscriptionRequest {
  return {
    id: 'sub-1',
    user_id: 'user-1',
    plan: 'pro',
    full_name: VALID_INPUT.full_name,
    phone_whatsapp: VALID_INPUT.phone_whatsapp,
    email: VALID_INPUT.email ?? null,
    note: VALID_INPUT.note ?? null,
    reference_code: REFERENCE,
    status: 'new',
    notes: null,
    created_at: '2026-11-04T00:00:00.000Z',
    updated_at: '2026-11-04T00:00:00.000Z',
    ...overrides,
  };
}

function toRow(input: SubscriptionRequestCreateInput): SubscriptionRequest {
  return makeRow({
    user_id: input.user_id,
    plan: input.plan,
    full_name: input.full_name,
    phone_whatsapp: input.phone_whatsapp,
    email: input.email,
    note: input.note,
    reference_code: input.reference_code,
  });
}

function makeService(overrides: Partial<SubscriptionRequestServiceDeps> = {}) {
  const repository = {
    create: vi.fn(async (input: SubscriptionRequestCreateInput) => toRow(input)),
    getById: vi.fn(async (): Promise<SubscriptionRequest | null> => makeRow()),
    getByClientId: vi.fn(async (): Promise<SubscriptionRequest | null> => null),
    list: vi.fn(async () => ({ data: [makeRow()], total: 1 })),
    listByUser: vi.fn(async (): Promise<SubscriptionRequest[]> => [makeRow()]),
    update: vi.fn(async (id: string, input: SubscriptionRequestUpdate) =>
      makeRow({ id, ...input })
    ),
  };
  const checkRateLimit = vi.fn(async () => true);
  const notifyAdmins = vi.fn();
  const captureException = vi.fn();

  const deps: SubscriptionRequestServiceDeps = {
    repository,
    checkRateLimit,
    generateReferenceCode: () => REFERENCE,
    notifyAdmins,
    captureException,
    ...overrides,
  };

  return {
    service: new SubscriptionRequestService(deps),
    repository,
    checkRateLimit,
    notifyAdmins,
    captureException,
  };
}

describe('SubscriptionRequestService.submit', () => {
  it('writes the request against the signed-in account, as the paid plan', async () => {
    const { service, repository, notifyAdmins } = makeService();

    const request = await service.submit(VALID_INPUT, { userId: 'user-1' });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        plan: 'pro',
        reference_code: REFERENCE,
        full_name: VALID_INPUT.full_name,
        client_id: null,
      })
    );
    expect(request.reference_code).toBe(REFERENCE);
    expect(notifyAdmins).toHaveBeenCalledWith(request, 'created');
  });

  it('returns the row a replayed Outbox submit already created', async () => {
    const existing = makeRow({ id: 'sub-existing' });
    const { service, repository, notifyAdmins } = makeService({
      repository: {
        ...makeService().repository,
        getByClientId: vi.fn(async () => existing),
      },
    });

    const request = await service.submit(
      { ...VALID_INPUT, client_id: '0190f0c0-0000-7000-8000-000000000000' },
      { userId: 'user-1' }
    );

    expect(request.id).toBe('sub-existing');
    expect(repository.create).not.toHaveBeenCalled();
    expect(notifyAdmins).not.toHaveBeenCalled();
  });

  it('stores a blank optional field as NULL, never as an empty string', async () => {
    const { service, repository } = makeService();

    await service.submit({ ...VALID_INPUT, email: '', note: '' }, { userId: 'user-1' });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: null, note: null })
    );
  });

  it('refuses past the per-account backstop', async () => {
    const { service, repository } = makeService({
      checkRateLimit: vi.fn(async () => false),
    });

    await expect(service.submit(VALID_INPUT, { userId: 'user-1' })).rejects.toBeInstanceOf(
      SubscriptionRequestRateLimitError
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('does not fail a committed request because the Admin notify threw', async () => {
    const { service, captureException } = makeService({
      notifyAdmins: vi.fn(() => {
        throw new Error('push fan-out down');
      }),
    });

    await expect(service.submit(VALID_INPUT, { userId: 'user-1' })).resolves.toBeDefined();
    expect(captureException).toHaveBeenCalled();
  });
});

describe('SubscriptionRequestService.update', () => {
  it('patches only the fields it was given', async () => {
    const { service, repository } = makeService();

    await service.update('sub-1', { status: 'activated' });

    expect(repository.update).toHaveBeenCalledWith('sub-1', { status: 'activated' });
  });

  it('404s a request that is not there', async () => {
    const { service } = makeService({
      repository: {
        ...makeService().repository,
        getById: vi.fn(async () => null),
      },
    });

    await expect(service.update('missing', { status: 'contacted' })).rejects.toBeInstanceOf(
      SubscriptionRequestNotFoundError
    );
  });
});
