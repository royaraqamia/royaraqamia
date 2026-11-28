import { describe, expect, it, vi } from 'vitest';

import type { AssistantIdentityRepository } from '@/backend/repositories/agent/assistant-identity-repository';
import type { AvatarStorageRepository } from '@/backend/repositories/users/avatar-storage-repository';
import { AssistantIdentityService } from '@/backend/services/agent/assistant-identity-service';
import { AvatarValidationError } from '@/backend/services/users/avatar-file';
import { AppError } from '@/backend/shared/errors';
import {
  DEFAULT_ASSISTANT_IDENTITY,
  type AssistantIdentity,
} from '@/shared/contracts/assistant-identity';

vi.mock('@/backend/services/images/bounded-image', () => ({
  prepareBoundedImage: vi.fn(async ({ file }: { file: File }) => ({
    accepted: true,
    file,
    pixels: 4,
  })),
}));

function identity(overrides: Partial<AssistantIdentity> = {}): AssistantIdentity {
  return {
    name: 'حكيم',
    customName: 'حكيم',
    avatarVariant: 3,
    avatarUrl: null,
    voice: 'masculine',
    tone: 'concise',
    note: null,
    updatedAt: '2026-11-27T10:00:00.000Z',
    ...overrides,
  };
}

function repository(overrides: Partial<AssistantIdentityRepository> = {}) {
  const repo: AssistantIdentityRepository = {
    read: vi.fn(async () => null),
    upsert: vi.fn(async (_userId, input, at) =>
      identity({ customName: input.name, voice: input.voice, updatedAt: at })
    ),
    setAvatar: vi.fn(async (_userId, avatarUrl, at) => identity({ avatarUrl, updatedAt: at })),
    reset: vi.fn(async () => undefined),
    ...overrides,
  };
  return repo;
}

function storage(overrides: Partial<AvatarStorageRepository> = {}) {
  const avatars: AvatarStorageRepository = {
    upload: vi.fn(async () => 'https://cdn.test/avatars/u-1/new.png'),
    remove: vi.fn(async () => undefined),
    ...overrides,
  };
  return avatars;
}

function service(repo: AssistantIdentityRepository, avatars: AvatarStorageRepository = storage()) {
  return new AssistantIdentityService({
    identities: repo,
    avatars,
    now: () => new Date('2026-11-27T10:00:00.000Z'),
  });
}

function png(size = 1024): File {
  return new File([new Uint8Array(size)], 'me.png', { type: 'image/png' });
}

describe('reading the identity (ADR-0224)', () => {
  it('answers the deployment default for a member who never saved one', async () => {
    await expect(service(repository()).read('user-1')).resolves.toEqual(DEFAULT_ASSISTANT_IDENTITY);
  });

  it('answers the stored row when there is one', async () => {
    const stored = identity();
    await expect(
      service(repository({ read: vi.fn(async () => stored) })).read('user-1')
    ).resolves.toEqual(stored);
  });
});

describe('saving the identity', () => {
  it('writes the parsed fields and stamps the row with the service clock', async () => {
    const repo = repository();
    const saved = await service(repo).save('user-1', {
      name: '  حكيم ',
      avatarVariant: 3,
      voice: 'masculine',
      tone: 'concise',
      note: null,
    });

    expect(repo.upsert).toHaveBeenCalledWith(
      'user-1',
      { name: 'حكيم', avatarVariant: 3, voice: 'masculine', tone: 'concise', note: null },
      '2026-11-27T10:00:00.000Z'
    );
    expect(saved.name).toBe('حكيم');
  });

  it('refuses a name the contract rejects, before the row is touched', async () => {
    const repo = repository();
    await expect(
      service(repo).save('user-1', {
        name: 'نور!',
        avatarVariant: null,
        voice: 'feminine',
        tone: 'default',
        note: null,
      })
    ).rejects.toBeInstanceOf(AppError);
    expect(repo.upsert).not.toHaveBeenCalled();
  });

  it('answers the contract’s own sentence for a refused name', async () => {
    await expect(
      service(repository()).save('user-1', {
        name: 'رؤية',
        avatarVariant: null,
        voice: 'feminine',
        tone: 'default',
        note: null,
      })
    ).rejects.toMatchObject({ statusCode: 400, message: 'هذا الاسم محجوز' });
  });

  it('refuses a body that is missing a field', async () => {
    await expect(service(repository()).save('user-1', { name: 'حكيم' })).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

describe('the face (ADR-0228)', () => {
  it('uploads, points the row at the new URL, then deletes the old object', async () => {
    const repo = repository({
      read: vi.fn(async () => identity({ avatarUrl: 'https://cdn.test/avatars/u-1/old.png' })),
    });
    const avatars = storage();

    const saved = await service(repo, avatars).updateAvatar('user-1', png());

    expect(saved.avatarUrl).toBe('https://cdn.test/avatars/u-1/new.png');
    expect(repo.setAvatar).toHaveBeenCalledWith(
      'user-1',
      'https://cdn.test/avatars/u-1/new.png',
      '2026-11-27T10:00:00.000Z'
    );
    expect(avatars.remove).toHaveBeenCalledWith('https://cdn.test/avatars/u-1/old.png');
  });

  it('rejects a non-image upload without touching storage', async () => {
    const avatars = storage();
    const file = new File(['x'], 'notes.txt', { type: 'text/plain' });

    await expect(
      service(repository(), avatars).updateAvatar('user-1', file)
    ).rejects.toBeInstanceOf(AvatarValidationError);
    expect(avatars.upload).not.toHaveBeenCalled();
  });

  it('rolls the fresh upload back when the row write fails', async () => {
    const repo = repository({
      setAvatar: vi.fn(async () => {
        throw new AppError('تعذّر الحفظ.', 500);
      }),
    });
    const avatars = storage();

    await expect(service(repo, avatars).updateAvatar('user-1', png())).rejects.toBeInstanceOf(
      AppError
    );
    expect(avatars.remove).toHaveBeenCalledWith('https://cdn.test/avatars/u-1/new.png');
  });

  it('clears the face and deletes the stored object', async () => {
    const repo = repository({
      read: vi.fn(async () => identity({ avatarUrl: 'https://cdn.test/avatars/u-1/old.png' })),
    });
    const avatars = storage();

    const saved = await service(repo, avatars).removeAvatar('user-1');

    expect(saved.avatarUrl).toBeNull();
    expect(repo.setAvatar).toHaveBeenCalledWith('user-1', null, '2026-11-27T10:00:00.000Z');
    expect(avatars.remove).toHaveBeenCalledWith('https://cdn.test/avatars/u-1/old.png');
  });

  it('answers the orb with no stored object when there was no face', async () => {
    const avatars = storage();

    await expect(service(repository(), avatars).removeAvatar('user-1')).resolves.toMatchObject({
      avatarUrl: null,
    });
    expect(avatars.remove).not.toHaveBeenCalled();
  });
});

describe('resetting the identity', () => {
  it('deletes the row and answers the default', async () => {
    const repo = repository();
    await expect(service(repo).reset('user-1')).resolves.toEqual(DEFAULT_ASSISTANT_IDENTITY);
    expect(repo.reset).toHaveBeenCalledWith('user-1');
  });
});
