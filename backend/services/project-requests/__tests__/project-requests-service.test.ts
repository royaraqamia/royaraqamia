import { describe, it, expect, vi } from 'vitest';
import type { ProjectRequestCreateInput } from '@/backend/repositories/project-requests/project-requests-repository';
import {
  ProjectRequestNotFoundError,
  ProjectRequestRateLimitError,
  ProjectRequestService,
  type ProjectRequestServiceDeps,
} from '@/backend/services/project-requests/project-requests-service';
import type {
  ProjectRequest,
  ProjectRequestInput,
  ProjectRequestStatus,
} from '@/shared/contracts/project-requests';

const REFERENCE = 'PRJ-2026-A7K2M9QX';

const VALID_INPUT: ProjectRequestInput = {
  full_name: 'أحمد العلي',
  phone_whatsapp: '+963 968 478 904',
  email: 'ahmad@example.com',
  project_type: 'website',
  description: 'أريد متجرًا إلكترونيًّا يعرض المنتجات ويتيح الطَّلب عبر واتساب.',
  budget_range: '300-600',
  timeline: 'flexible',
  existing_url: 'https://example.com',
};

function makeRow(overrides: Partial<ProjectRequest> = {}): ProjectRequest {
  return {
    id: 'req-1',
    full_name: VALID_INPUT.full_name,
    phone_whatsapp: VALID_INPUT.phone_whatsapp,
    email: VALID_INPUT.email ?? null,
    project_type: VALID_INPUT.project_type,
    description: VALID_INPUT.description,
    budget_range: VALID_INPUT.budget_range ?? null,
    timeline: VALID_INPUT.timeline ?? null,
    existing_url: VALID_INPUT.existing_url ?? null,
    reference_code: REFERENCE,
    status: 'new',
    notes: null,
    user_id: null,
    created_at: '2026-09-25T00:00:00.000Z',
    updated_at: '2026-09-25T00:00:00.000Z',
    ...overrides,
  };
}

function toRow(input: ProjectRequestCreateInput): ProjectRequest {
  return makeRow({
    full_name: input.full_name,
    phone_whatsapp: input.phone_whatsapp,
    email: input.email,
    project_type: input.project_type,
    description: input.description,
    budget_range: input.budget_range,
    timeline: input.timeline,
    existing_url: input.existing_url,
    reference_code: input.reference_code,
    user_id: input.user_id,
  });
}

function makeService(overrides: Partial<ProjectRequestServiceDeps> = {}) {
  const repository = {
    create: vi.fn(async (input: ProjectRequestCreateInput) => toRow(input)),
    getById: vi.fn(async (): Promise<ProjectRequest | null> => makeRow()),
    list: vi.fn(async () => ({ data: [makeRow()], total: 1 })),
    updateStatus: vi.fn(async (id: string, status: ProjectRequestStatus, notes: string | null) =>
      makeRow({ id, status, notes })
    ),
  };
  const checkRateLimit = vi.fn(async () => true);
  const notifyAdmins = vi.fn();
  const captureException = vi.fn();

  const service = new ProjectRequestService({
    repository,
    checkRateLimit,
    generateReferenceCode: () => REFERENCE,
    notifyAdmins,
    captureException,
    ...overrides,
  });

  return { service, repository, checkRateLimit, notifyAdmins, captureException };
}

describe('ProjectRequestService.submit', () => {
  it('stores the request and returns the committed row', async () => {
    const { service, repository } = makeService();

    const created = await service.submit(VALID_INPUT, { ip: '1.1.1.1' });

    expect(created.reference_code).toBe(REFERENCE);
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ reference_code: REFERENCE })
    );
  });

  it('records a signed-in visitor on the row', async () => {
    const { service, repository } = makeService();

    await service.submit(VALID_INPUT, { ip: '1.1.1.1', userId: 'user-9' });

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'user-9' }));
  });

  it('records no user for an anonymous visitor', async () => {
    const { service, repository } = makeService();

    await service.submit(VALID_INPUT, { ip: '1.1.1.1' });

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ user_id: null }));
  });

  it('stores blank optional fields as NULL rather than empty strings', async () => {
    const { service, repository } = makeService();

    await service.submit(
      {
        ...VALID_INPUT,
        email: '',
        budget_range: undefined,
        timeline: undefined,
        existing_url: '  ',
      },
      { ip: '1.1.1.1' }
    );

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        email: null,
        budget_range: null,
        timeline: null,
        existing_url: null,
      })
    );
  });

  it('refuses a submission past the per-IP limit without writing anything', async () => {
    const { service, repository, checkRateLimit, notifyAdmins } = makeService();
    checkRateLimit.mockResolvedValue(false);

    await expect(service.submit(VALID_INPUT, { ip: '9.9.9.9' })).rejects.toBeInstanceOf(
      ProjectRequestRateLimitError
    );
    expect(checkRateLimit).toHaveBeenCalledWith('project-request:9.9.9.9', 10, 600_000);
    expect(repository.create).not.toHaveBeenCalled();
    expect(notifyAdmins).not.toHaveBeenCalled();
  });

  it('notifies the Admin once the row is committed', async () => {
    const { service, notifyAdmins } = makeService();

    const created = await service.submit(VALID_INPUT, { ip: '1.1.1.1' });

    expect(notifyAdmins).toHaveBeenCalledWith(created);
  });

  it('does not fail the submission when the notification throws', async () => {
    const { service, captureException } = makeService({
      notifyAdmins: vi.fn(() => {
        throw new Error('push service down');
      }),
    });

    await expect(service.submit(VALID_INPUT, { ip: '1.1.1.1' })).resolves.toMatchObject({
      reference_code: REFERENCE,
    });
    expect(captureException).toHaveBeenCalled();
  });

  it('retries with a fresh reference code when the column collides', async () => {
    const collisions = [
      Object.assign(new Error('duplicate key'), { code: '23505' }),
      Object.assign(new Error('duplicate key'), { code: '23505' }),
    ];
    const { service, repository } = makeService({
      generateReferenceCode: vi.fn(() => REFERENCE),
    });
    repository.create
      .mockRejectedValueOnce(collisions[0])
      .mockRejectedValueOnce(collisions[1])
      .mockImplementationOnce(async (input: ProjectRequestCreateInput) => toRow(input));

    await expect(service.submit(VALID_INPUT, { ip: '1.1.1.1' })).resolves.toMatchObject({
      reference_code: REFERENCE,
    });
    expect(repository.create).toHaveBeenCalledTimes(3);
  });

  it('gives up after three collisions with its own error', async () => {
    const collision = Object.assign(new Error('duplicate key'), { code: '23505' });
    const { service, repository } = makeService();
    repository.create.mockRejectedValue(collision);

    await expect(service.submit(VALID_INPUT, { ip: '1.1.1.1' })).rejects.toThrow(/رمز طلب فريد/);
    expect(repository.create).toHaveBeenCalledTimes(3);
  });

  it('rethrows a failure that is not a collision', async () => {
    const { service, repository } = makeService();
    repository.create.mockRejectedValue(new Error('db down'));

    await expect(service.submit(VALID_INPUT, { ip: '1.1.1.1' })).rejects.toThrow('db down');
    expect(repository.create).toHaveBeenCalledTimes(1);
  });
});

describe('ProjectRequestService.list', () => {
  it('delegates the query to the repository unchanged', async () => {
    const { service, repository } = makeService();
    const query = { page: 2, pageSize: 20, status: 'new' as const, search: 'أحمد' };

    const result = await service.list(query);

    expect(repository.list).toHaveBeenCalledWith(query);
    expect(result.total).toBe(1);
  });
});

describe('ProjectRequestService.update', () => {
  it('moves the request and returns the updated row', async () => {
    const { service, repository } = makeService();

    const updated = await service.update('req-1', { status: 'contacted' });

    expect(repository.updateStatus).toHaveBeenCalledWith('req-1', 'contacted', null);
    expect(updated.status).toBe('contacted');
  });

  it('stores blank notes as NULL rather than an empty string', async () => {
    const { service, repository } = makeService();

    await service.update('req-1', { status: 'quoted', notes: '   ' });

    expect(repository.updateStatus).toHaveBeenCalledWith('req-1', 'quoted', null);
  });

  it('trims notes before storing them', async () => {
    const { service, repository } = makeService();

    await service.update('req-1', { status: 'won', notes: '  ملاحظة  ' });

    expect(repository.updateStatus).toHaveBeenCalledWith('req-1', 'won', 'ملاحظة');
  });

  it('refuses to update a request that does not exist', async () => {
    const { service, repository } = makeService();
    repository.getById.mockResolvedValue(null);

    await expect(service.update('missing', { status: 'won' })).rejects.toBeInstanceOf(
      ProjectRequestNotFoundError
    );
    expect(repository.updateStatus).not.toHaveBeenCalled();
  });
});
