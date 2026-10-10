import { describe, it, expect, vi } from 'vitest';
import {
  TrainingApplicationClosedError,
  TrainingApplicationEnrolledError,
  TrainingApplicationNotFoundError,
  TrainingApplicationRateLimitError,
  TrainingApplicationService,
  generateTrainingReferenceCode,
} from '@/backend/services/training/training-application-service';
import {
  CohortFullError,
  NotEnrolledError,
  type TrainingApplicationCreateInput,
  type TrainingApplicationEditFields,
  type TrainingApplicationsRepository,
} from '@/backend/repositories/training/training-applications-repository';
import {
  TRAINING_REFERENCE_CODE_REGEX,
  type TrainingApplication,
  type TrainingApplicationEditInput,
  type TrainingApplicationInput,
} from '@/shared/contracts/training';
import { createRateLimiter } from '@/backend/clients/rate-limiter';

const VALID_INPUT: TrainingApplicationInput = {
  course_slug: 'build-digital-products',
  full_name: 'أحمد العلي',
  phone_whatsapp: '+963 968 478 904',
  goal: 'أريد بناء متجر إلكتروني.',
  cohort_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
};

function makeApplication(overrides: Partial<TrainingApplication> = {}): TrainingApplication {
  return {
    id: 'app-1',
    course_slug: 'build-digital-products',
    full_name: 'أحمد العلي',
    phone_whatsapp: '+963 968 478 904',
    goal: 'أريد بناء متجر إلكتروني.',
    reference_code: 'TRN-2026-A7K2M9QX',
    status: 'new',
    cohort_id: null,
    notes: null,
    user_id: null,
    created_at: '2026-09-16T00:00:00.000Z',
    updated_at: '2026-09-16T00:00:00.000Z',
    edited_at: null,
    ...overrides,
  };
}

function makeRepository(overrides: Partial<TrainingApplicationsRepository> = {}) {
  return {
    getById: vi.fn().mockResolvedValue(makeApplication()),
    getByReferenceCode: vi.fn().mockResolvedValue(null),
    list: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    create: vi.fn().mockImplementation((input: TrainingApplicationCreateInput) =>
      Promise.resolve(
        makeApplication({
          reference_code: input.reference_code,
          goal: input.goal,
          user_id: input.user_id,
        })
      )
    ),
    updateStatus: vi.fn().mockResolvedValue(makeApplication({ status: 'contacted' })),
    listByUser: vi.fn().mockResolvedValue([makeApplication({ user_id: 'user-9' })]),
    updateOwned: vi
      .fn()
      .mockImplementation(
        (
          id: string,
          userId: string,
          input: TrainingApplicationEditFields,
          cohortId: string | null
        ) =>
          Promise.resolve(
            makeApplication({
              id,
              user_id: userId,
              ...input,
              cohort_id: cohortId,
              edited_at: '2026-09-17T00:00:00.000Z',
            })
          )
      ),
    ...overrides,
  } as unknown as TrainingApplicationsRepository;
}

function makeService(
  options: {
    repository?: TrainingApplicationsRepository;
    checkRateLimit?: () => Promise<boolean>;
    notifyAdmins?: (application: TrainingApplication) => void;
    generateReferenceCode?: () => string;
    isApplicationOpen?: () => boolean;
  } = {}
) {
  const repository = options.repository ?? makeRepository();
  const checkRateLimit = vi.fn(options.checkRateLimit ?? (() => Promise.resolve(true)));
  const notifyAdmins = vi.fn(options.notifyAdmins ?? (() => undefined));

  const service = new TrainingApplicationService({
    repository,
    checkRateLimit,
    notifyAdmins,
    isApplicationOpen: options.isApplicationOpen ?? (() => true),
    generateReferenceCode: options.generateReferenceCode ?? (() => 'TRN-2026-A7K2M9QX'),
    captureException: vi.fn(),
  });

  return { service, repository, checkRateLimit, notifyAdmins };
}

describe('generateTrainingReferenceCode', () => {
  it('produces a TRN-YYYY-XXXXXXXX code matching the contract regex', () => {
    expect(generateTrainingReferenceCode()).toMatch(TRAINING_REFERENCE_CODE_REGEX);
    expect(generateTrainingReferenceCode()).toMatch(TRAINING_REFERENCE_CODE_REGEX);
  });

  it('omits characters that are easy to misread aloud', () => {
    const code = generateTrainingReferenceCode().split('-')[2] ?? '';
    expect(code).not.toMatch(/[IO01]/);
  });

  it('does not repeat itself in practice', () => {
    const codes = new Set(Array.from({ length: 200 }, () => generateTrainingReferenceCode()));
    expect(codes.size).toBe(200);
  });
});

describe('TrainingApplicationService.submit', () => {
  it('persists an application and returns it with a reference code', async () => {
    const { service, repository } = makeService();

    const application = await service.submit(VALID_INPUT, { ip: '1.1.1.1' });

    expect(repository.create).toHaveBeenCalledTimes(1);
    expect(application.reference_code).toMatch(TRAINING_REFERENCE_CODE_REGEX);
  });

  it('stores a blank goal as null rather than an empty string', async () => {
    const { service, repository } = makeService();

    await service.submit({ ...VALID_INPUT, goal: '' }, { ip: '1.1.1.1' });

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ goal: null }));
  });

  it('attributes the application to a signed-in visitor when one exists', async () => {
    const { service, repository } = makeService();

    await service.submit(VALID_INPUT, { ip: '1.1.1.1', userId: 'user-9' });

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'user-9' }));
  });

  it('rejects the submission when the course is closed', async () => {
    const { service, repository, checkRateLimit } = makeService({
      isApplicationOpen: () => false,
    });

    await expect(service.submit(VALID_INPUT, { ip: '1.1.1.1' })).rejects.toBeInstanceOf(
      TrainingApplicationClosedError
    );
    expect(repository.create).not.toHaveBeenCalled();
    expect(checkRateLimit).not.toHaveBeenCalled();
  });

  it('rejects the submission when the IP is over the rate limit', async () => {
    const { service, repository } = makeService({
      checkRateLimit: () => Promise.resolve(false),
    });

    await expect(service.submit(VALID_INPUT, { ip: '1.1.1.1' })).rejects.toBeInstanceOf(
      TrainingApplicationRateLimitError
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('checks the per-IP limit before the global limit', async () => {
    const { service, checkRateLimit } = makeService();

    await service.submit(VALID_INPUT, { ip: '1.1.1.1' });

    expect(checkRateLimit).toHaveBeenNthCalledWith(
      1,
      'training-apply:1.1.1.1',
      expect.any(Number),
      expect.any(Number)
    );
    expect(checkRateLimit).toHaveBeenNthCalledWith(
      2,
      'training-apply:global',
      expect.any(Number),
      expect.any(Number)
    );
  });

  it('does not apply the global check when the IP is already limited', async () => {
    const { service, checkRateLimit } = makeService({
      checkRateLimit: () => Promise.resolve(false),
    });

    await expect(service.submit(VALID_INPUT, { ip: '1.1.1.1' })).rejects.toBeInstanceOf(
      TrainingApplicationRateLimitError
    );
    expect(checkRateLimit).toHaveBeenCalledTimes(1);
  });

  it('rejects when the global limit is exceeded even though the IP is under its cap', async () => {
    const { service, repository, checkRateLimit } = makeService();
    checkRateLimit.mockResolvedValueOnce(true).mockResolvedValueOnce(false);

    await expect(service.submit(VALID_INPUT, { ip: '1.1.1.1' })).rejects.toBeInstanceOf(
      TrainingApplicationRateLimitError
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('accepts a burst of 100 applications from one shared IP', async () => {
    const created: TrainingApplicationCreateInput[] = [];
    const repository = makeRepository({
      create: vi.fn().mockImplementation((input: TrainingApplicationCreateInput) => {
        created.push(input);
        return Promise.resolve(makeApplication({ reference_code: input.reference_code }));
      }),
    } as Partial<TrainingApplicationsRepository>);

    // Real in-memory limiter with the real service: proves the shared-IP
    // (classroom/NAT) path, not just that the mock says yes.
    const limiter = createRateLimiter();
    const service = new TrainingApplicationService({
      repository,
      checkRateLimit: (key, limit, windowMs) => limiter.checkRateLimit(key, limit, windowMs),
      notifyAdmins: vi.fn(),
      isApplicationOpen: () => true,
      generateReferenceCode: () => `TRN-2026-BURST${created.length}`,
      captureException: vi.fn(),
    });

    const applications = await Promise.all(
      Array.from({ length: 100 }, () => service.submit(VALID_INPUT, { ip: '203.0.113.7' }))
    );

    expect(applications).toHaveLength(100);
    expect(created).toHaveLength(100);
    expect(new Set(applications.map((app) => app.reference_code)).size).toBe(100);
  });

  it('notifies admins after the row is committed', async () => {
    const { service, notifyAdmins } = makeService();

    await service.submit(VALID_INPUT, { ip: '1.1.1.1' });

    expect(notifyAdmins).toHaveBeenCalledTimes(1);
    expect(notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ reference_code: 'TRN-2026-A7K2M9QX' }),
      'created'
    );
  });

  it('still succeeds when the admin notification throws', async () => {
    const { service } = makeService({
      notifyAdmins: () => {
        throw new Error('push service down');
      },
    });

    await expect(service.submit(VALID_INPUT, { ip: '1.1.1.1' })).resolves.toMatchObject({
      reference_code: 'TRN-2026-A7K2M9QX',
    });
  });

  it('retries with a fresh reference code on a unique violation', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505' }))
      .mockImplementation((input: TrainingApplicationCreateInput) =>
        Promise.resolve(makeApplication({ reference_code: input.reference_code }))
      );
    let counter = 0;

    const { service } = makeService({
      repository: makeRepository({ create } as Partial<TrainingApplicationsRepository>),
      generateReferenceCode: () => `TRN-2026-CODE000${++counter}`,
    });

    const application = await service.submit(VALID_INPUT, { ip: '1.1.1.1' });

    expect(create).toHaveBeenCalledTimes(2);
    expect(application.reference_code).toBe('TRN-2026-CODE0002');
  });

  it('gives up after three collisions instead of looping forever', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('duplicate'), { code: '23505' }));
    const { service } = makeService({
      repository: makeRepository({ create } as Partial<TrainingApplicationsRepository>),
    });

    await expect(service.submit(VALID_INPUT, { ip: '1.1.1.1' })).rejects.toThrow('رمز');
    expect(create).toHaveBeenCalledTimes(3);
  });

  it('propagates a non-collision database error', async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error('boom'), { code: '42P01' }));
    const { service } = makeService({
      repository: makeRepository({ create } as Partial<TrainingApplicationsRepository>),
    });

    await expect(service.submit(VALID_INPUT, { ip: '1.1.1.1' })).rejects.toThrow('boom');
  });

  it('retries a transient connection reset with the same reference code', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' }))
      .mockImplementation((input: TrainingApplicationCreateInput) =>
        Promise.resolve(makeApplication({ reference_code: input.reference_code }))
      );
    const { service } = makeService({
      repository: makeRepository({ create } as Partial<TrainingApplicationsRepository>),
    });

    const application = await service.submit(VALID_INPUT, { ip: '1.1.1.1' });

    expect(create).toHaveBeenCalledTimes(2);
    const firstCode = create.mock.calls[0]?.[0]?.reference_code;
    const secondCode = create.mock.calls[1]?.[0]?.reference_code;
    expect(firstCode).toBe(secondCode);
    expect(application.reference_code).toBe('TRN-2026-A7K2M9QX');
  });

  it('returns the committed row instead of duplicating after an ambiguous retry', async () => {
    const existing = makeApplication({ reference_code: 'TRN-2026-A7K2M9QX' });
    const create = vi
      .fn()
      .mockRejectedValueOnce(Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' }))
      .mockRejectedValueOnce(Object.assign(new Error('duplicate'), { code: '23505' }));
    const { service, repository } = makeService({
      repository: makeRepository({
        create,
        getByReferenceCode: vi.fn().mockResolvedValue(existing),
      } as Partial<TrainingApplicationsRepository>),
    });

    const application = await service.submit(VALID_INPUT, { ip: '1.1.1.1' });

    expect(application).toBe(existing);
    expect(create).toHaveBeenCalledTimes(2);
    expect(repository.getByReferenceCode).toHaveBeenCalledWith('TRN-2026-A7K2M9QX');
  });

  it('gives up after repeated transient failures instead of retrying forever', async () => {
    const create = vi
      .fn()
      .mockRejectedValue(Object.assign(new Error('fetch failed'), { code: 'ECONNRESET' }));
    const { service } = makeService({
      repository: makeRepository({ create } as Partial<TrainingApplicationsRepository>),
    });

    await expect(service.submit(VALID_INPUT, { ip: '1.1.1.1' })).rejects.toThrow('fetch failed');
    expect(create).toHaveBeenCalledTimes(4);
  });
});

describe('TrainingApplicationService.update', () => {
  it('updates the status and trims notes', async () => {
    const { service, repository } = makeService();

    await service.update('app-1', { status: 'contacted', notes: '  اتصلت به  ' });

    expect(repository.updateStatus).toHaveBeenCalledWith('app-1', 'contacted', 'اتصلت به');
  });

  it('writes null when notes are blanked out', async () => {
    const { service, repository } = makeService();

    await service.update('app-1', { status: 'contacted', notes: '   ' });

    expect(repository.updateStatus).toHaveBeenCalledWith('app-1', 'contacted', null);
  });

  it('rejects an unknown application', async () => {
    const { service } = makeService({
      repository: makeRepository({ getById: vi.fn().mockResolvedValue(null) }),
    });

    await expect(service.update('missing', { status: 'contacted' })).rejects.toThrow('غير موجود');
  });

  it('refuses to move an enrolled application off enrolled without releasing the seat', async () => {
    const { service, repository } = makeService({
      repository: makeRepository({
        getById: vi
          .fn()
          .mockResolvedValue(makeApplication({ status: 'enrolled', cohort_id: 'cohort-seat' })),
      } as Partial<TrainingApplicationsRepository>),
    });

    await expect(service.update('app-1', { status: 'contacted' })).rejects.toBeInstanceOf(
      TrainingApplicationEnrolledError
    );
    expect(repository.updateStatus).not.toHaveBeenCalled();
  });
});

describe('TrainingApplicationService.enroll', () => {
  it('delegates to the repository enroll, which owns the race guard', async () => {
    const enroll = vi.fn().mockResolvedValue(makeApplication({ status: 'enrolled' }));
    const { service, repository } = makeService({
      repository: makeRepository({ enroll } as Partial<TrainingApplicationsRepository>),
    });

    await service.enroll('app-1', 'cohort-1');

    expect(repository.enroll).toHaveBeenCalledWith('app-1', 'cohort-1');
  });

  it('rejects an unknown application without touching the cohort', async () => {
    const enroll = vi.fn();
    const { service } = makeService({
      repository: makeRepository({
        getById: vi.fn().mockResolvedValue(null),
        enroll,
      } as Partial<TrainingApplicationsRepository>),
    });

    await expect(service.enroll('missing', 'cohort-1')).rejects.toThrow('غير موجود');
    expect(enroll).not.toHaveBeenCalled();
  });

  it('propagates a full cohort instead of swallowing it', async () => {
    const enroll = vi.fn().mockRejectedValue(new CohortFullError());
    const { service } = makeService({
      repository: makeRepository({ enroll } as Partial<TrainingApplicationsRepository>),
    });

    await expect(service.enroll('app-1', 'cohort-1')).rejects.toBeInstanceOf(CohortFullError);
  });
});

describe('TrainingApplicationService.listMine', () => {
  it('reads only the signed-in applicant\u2019s applications', async () => {
    const { service, repository } = makeService();

    const rows = await service.listMine('user-9');

    expect(repository.listByUser).toHaveBeenCalledWith('user-9');
    expect(rows).toHaveLength(1);
  });
});

describe('TrainingApplicationService.updateOwned', () => {
  const EDIT: TrainingApplicationEditInput = {
    ...VALID_INPUT,
    full_name: 'أحمد المحدَّث',
    cohort_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3302',
  };

  it('replaces the visitor fields and attributes the edit to the owner', async () => {
    const { service, repository } = makeService({
      repository: makeRepository({
        getById: vi.fn().mockResolvedValue(makeApplication({ user_id: 'user-9' })),
      } as Partial<TrainingApplicationsRepository>),
    });

    const updated = await service.updateOwned('user-9', 'app-1', EDIT);

    expect(repository.updateOwned).toHaveBeenCalledWith(
      'app-1',
      'user-9',
      expect.objectContaining({ full_name: 'أحمد المحدَّث' }),
      EDIT.cohort_id
    );
    expect(updated.full_name).toBe('أحمد المحدَّث');
  });

  it('stores a blank goal as null rather than an empty string', async () => {
    const { service, repository } = makeService({
      repository: makeRepository({
        getById: vi.fn().mockResolvedValue(makeApplication({ user_id: 'user-9' })),
      } as Partial<TrainingApplicationsRepository>),
    });

    await service.updateOwned('user-9', 'app-1', { ...EDIT, goal: '' });

    expect(repository.updateOwned).toHaveBeenCalledWith(
      'app-1',
      'user-9',
      expect.objectContaining({ goal: null }),
      expect.anything()
    );
  });

  it('notifies the Admin that the application was edited', async () => {
    const { service, notifyAdmins } = makeService({
      repository: makeRepository({
        getById: vi.fn().mockResolvedValue(makeApplication({ user_id: 'user-9' })),
      } as Partial<TrainingApplicationsRepository>),
    });

    const updated = await service.updateOwned('user-9', 'app-1', EDIT);

    expect(notifyAdmins).toHaveBeenCalledWith(updated, 'edited');
  });

  it('refuses an edit to an application the visitor does not own', async () => {
    const { service, repository } = makeService({
      repository: makeRepository({
        getById: vi.fn().mockResolvedValue(makeApplication({ user_id: 'someone-else' })),
      } as Partial<TrainingApplicationsRepository>),
    });

    await expect(service.updateOwned('user-9', 'app-1', EDIT)).rejects.toBeInstanceOf(
      TrainingApplicationNotFoundError
    );
    expect(repository.updateOwned).not.toHaveBeenCalled();
  });

  it('refuses to change the cohort while the application is enrolled', async () => {
    const { service, repository } = makeService({
      repository: makeRepository({
        getById: vi.fn().mockResolvedValue(
          makeApplication({
            user_id: 'user-9',
            status: 'enrolled',
            cohort_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
          })
        ),
      } as Partial<TrainingApplicationsRepository>),
    });

    await expect(service.updateOwned('user-9', 'app-1', EDIT)).rejects.toBeInstanceOf(
      TrainingApplicationEnrolledError
    );
    expect(repository.updateOwned).not.toHaveBeenCalled();
  });

  it('lets an enrolled applicant edit their details without moving the seat', async () => {
    const { service, repository } = makeService({
      repository: makeRepository({
        getById: vi.fn().mockResolvedValue(
          makeApplication({
            user_id: 'user-9',
            status: 'enrolled',
            cohort_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
          })
        ),
      } as Partial<TrainingApplicationsRepository>),
    });

    await service.updateOwned('user-9', 'app-1', {
      ...EDIT,
      cohort_id: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
    });

    expect(repository.updateOwned).toHaveBeenCalledWith(
      'app-1',
      'user-9',
      expect.anything(),
      '3f2504e0-4f89-41d3-9a0c-0305e82c3301'
    );
  });

  it('refuses an edit past the per-user limit without writing anything', async () => {
    const { service, repository } = makeService({
      checkRateLimit: () => Promise.resolve(false),
      repository: makeRepository({
        getById: vi.fn().mockResolvedValue(makeApplication({ user_id: 'user-9' })),
      } as Partial<TrainingApplicationsRepository>),
    });

    await expect(service.updateOwned('user-9', 'app-1', EDIT)).rejects.toBeInstanceOf(
      TrainingApplicationRateLimitError
    );
    expect(repository.updateOwned).not.toHaveBeenCalled();
  });
});

describe('TrainingApplicationService.release', () => {
  it('delegates to the repository release with a trimmed status and notes', async () => {
    const release = vi.fn().mockResolvedValue(makeApplication({ status: 'contacted' }));
    const { service, repository } = makeService({
      repository: makeRepository({ release } as Partial<TrainingApplicationsRepository>),
    });

    await service.release('app-1', 'contacted', null);

    expect(repository.release).toHaveBeenCalledWith('app-1', 'contacted', null);
  });

  it('rejects an application that is not enrolled', async () => {
    const release = vi.fn().mockRejectedValue(new NotEnrolledError());
    const { service } = makeService({
      repository: makeRepository({ release } as Partial<TrainingApplicationsRepository>),
    });

    await expect(service.release('app-1', 'contacted', null)).rejects.toBeInstanceOf(
      NotEnrolledError
    );
  });
});
