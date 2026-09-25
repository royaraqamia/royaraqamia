import { describe, it, expect, vi } from 'vitest';
import type { ProjectRequestCreateInput } from '@/backend/repositories/project-requests/project-requests-repository';
import {
  ProjectRequestRateLimitError,
  ProjectRequestService,
  type ProjectRequestServiceDeps,
} from '@/backend/services/project-requests/project-requests-service';
import type { ProjectRequest, ProjectRequestInput } from '@/shared/contracts/project-requests';

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

function toRow(input: ProjectRequestCreateInput): ProjectRequest {
  return {
    id: 'req-1',
    full_name: input.full_name,
    phone_whatsapp: input.phone_whatsapp,
    email: input.email,
    project_type: input.project_type,
    description: input.description,
    budget_range: input.budget_range,
    timeline: input.timeline,
    existing_url: input.existing_url,
    reference_code: input.reference_code,
    status: 'new',
    notes: null,
    user_id: input.user_id,
    created_at: '2026-09-25T00:00:00.000Z',
    updated_at: '2026-09-25T00:00:00.000Z',
  };
}

function makeService(overrides: Partial<ProjectRequestServiceDeps> = {}) {
  const repository = { create: vi.fn(async (input: ProjectRequestCreateInput) => toRow(input)) };
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
