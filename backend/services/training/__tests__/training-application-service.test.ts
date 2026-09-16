import { describe, it, expect, vi } from 'vitest';
import {
  TrainingApplicationClosedError,
  TrainingApplicationRateLimitError,
  TrainingApplicationService,
  TrainingApplicationVerificationError,
  generateTrainingReferenceCode,
} from '@/backend/services/training/training-application-service';
import type {
  TrainingApplicationCreateInput,
  TrainingApplicationsRepository,
} from '@/backend/repositories/training/training-applications-repository';
import {
  TRAINING_REFERENCE_CODE_REGEX,
  type TrainingApplication,
  type TrainingApplicationInput,
} from '@/shared/contracts/training';

const VALID_INPUT: TrainingApplicationInput = {
  course_slug: 'build-digital-products',
  full_name: 'أحمد العلي',
  phone_whatsapp: '+963 968 478 904',
  email: 'student@example.com',
  experience_level: 'basic',
  goal: 'أريد بناء متجر إلكتروني.',
};

function makeApplication(overrides: Partial<TrainingApplication> = {}): TrainingApplication {
  return {
    id: 'app-1',
    course_slug: 'build-digital-products',
    full_name: 'أحمد العلي',
    phone_whatsapp: '+963 968 478 904',
    email: 'student@example.com',
    experience_level: 'basic',
    goal: 'أريد بناء متجر إلكتروني.',
    reference_code: 'TRN-2026-A7K2M9QX',
    status: 'new',
    notes: null,
    user_id: null,
    created_at: '2026-09-16T00:00:00.000Z',
    updated_at: '2026-09-16T00:00:00.000Z',
    ...overrides,
  };
}

function makeRepository(overrides: Partial<TrainingApplicationsRepository> = {}) {
  return {
    getById: vi.fn().mockResolvedValue(makeApplication()),
    list: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    create: vi.fn().mockImplementation((input: TrainingApplicationCreateInput) =>
      Promise.resolve(
        makeApplication({
          reference_code: input.reference_code,
          email: input.email,
          goal: input.goal,
          user_id: input.user_id,
        })
      )
    ),
    updateStatus: vi.fn().mockResolvedValue(makeApplication({ status: 'contacted' })),
    ...overrides,
  } as unknown as TrainingApplicationsRepository;
}

function makeService(
  options: {
    repository?: TrainingApplicationsRepository;
    checkRateLimit?: () => Promise<boolean>;
    verifyTurnstile?: () => Promise<boolean>;
    notifyAdmins?: (application: TrainingApplication) => void;
    generateReferenceCode?: () => string;
    isApplicationOpen?: () => boolean;
  } = {}
) {
  const repository = options.repository ?? makeRepository();
  const checkRateLimit = vi.fn(options.checkRateLimit ?? (() => Promise.resolve(true)));
  const verifyTurnstile = vi.fn(options.verifyTurnstile ?? (() => Promise.resolve(true)));
  const notifyAdmins = vi.fn(options.notifyAdmins ?? (() => undefined));

  const service = new TrainingApplicationService({
    repository,
    checkRateLimit,
    verifyTurnstile,
    notifyAdmins,
    isApplicationOpen: options.isApplicationOpen ?? (() => true),
    generateReferenceCode: options.generateReferenceCode ?? (() => 'TRN-2026-A7K2M9QX'),
    captureException: vi.fn(),
  });

  return { service, repository, checkRateLimit, verifyTurnstile, notifyAdmins };
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

  it('stores blank email and goal as null rather than empty strings', async () => {
    const { service, repository } = makeService();

    await service.submit({ ...VALID_INPUT, email: '   ', goal: '' }, { ip: '1.1.1.1' });

    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: null, goal: null })
    );
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
    const { service, repository, verifyTurnstile } = makeService({
      checkRateLimit: () => Promise.resolve(false),
    });

    await expect(service.submit(VALID_INPUT, { ip: '1.1.1.1' })).rejects.toBeInstanceOf(
      TrainingApplicationRateLimitError
    );
    expect(repository.create).not.toHaveBeenCalled();
    expect(verifyTurnstile).not.toHaveBeenCalled();
  });

  it('rejects the submission when Turnstile fails', async () => {
    const { service, repository } = makeService({
      verifyTurnstile: () => Promise.resolve(false),
    });

    await expect(service.submit(VALID_INPUT, { ip: '1.1.1.1' })).rejects.toBeInstanceOf(
      TrainingApplicationVerificationError
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('passes an empty token to the verifier when the widget is absent', async () => {
    const { service, verifyTurnstile } = makeService();

    await service.submit({ ...VALID_INPUT, turnstile_token: undefined }, { ip: '1.1.1.1' });

    expect(verifyTurnstile).toHaveBeenCalledWith('');
  });

  it('notifies admins after the row is committed', async () => {
    const { service, notifyAdmins } = makeService();

    await service.submit(VALID_INPUT, { ip: '1.1.1.1' });

    expect(notifyAdmins).toHaveBeenCalledTimes(1);
    expect(notifyAdmins).toHaveBeenCalledWith(
      expect.objectContaining({ reference_code: 'TRN-2026-A7K2M9QX' })
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
});

describe('TrainingApplicationService.update', () => {
  it('updates the status and trims notes', async () => {
    const { service, repository } = makeService();

    await service.update('app-1', { status: 'contacted', notes: '  اتصلت به  ' });

    expect(repository.updateStatus).toHaveBeenCalledWith('app-1', 'contacted', 'اتصلت به');
  });

  it('writes null when notes are blanked out', async () => {
    const { service, repository } = makeService();

    await service.update('app-1', { status: 'enrolled', notes: '   ' });

    expect(repository.updateStatus).toHaveBeenCalledWith('app-1', 'enrolled', null);
  });

  it('rejects an unknown application', async () => {
    const { service } = makeService({
      repository: makeRepository({ getById: vi.fn().mockResolvedValue(null) }),
    });

    await expect(service.update('missing', { status: 'contacted' })).rejects.toThrow('غير موجود');
  });
});
