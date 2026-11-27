import { describe, expect, it, vi } from 'vitest';

import type { AssistantIdentityRepository } from '@/backend/repositories/agent/assistant-identity-repository';
import { AssistantIdentityService } from '@/backend/services/agent/assistant-identity-service';
import { AppError } from '@/backend/shared/errors';
import {
  DEFAULT_ASSISTANT_IDENTITY,
  type AssistantIdentity,
} from '@/shared/contracts/assistant-identity';

function identity(overrides: Partial<AssistantIdentity> = {}): AssistantIdentity {
  return {
    name: 'حكيم',
    customName: 'حكيم',
    avatarVariant: 3,
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
      identity({ customName: input.name, updatedAt: at })
    ),
    reset: vi.fn(async () => undefined),
    ...overrides,
  };
  return repo;
}

function service(repo: AssistantIdentityRepository) {
  return new AssistantIdentityService({
    identities: repo,
    now: () => new Date('2026-11-27T10:00:00.000Z'),
  });
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
      tone: 'concise',
      note: null,
    });

    expect(repo.upsert).toHaveBeenCalledWith(
      'user-1',
      { name: 'حكيم', avatarVariant: 3, tone: 'concise', note: null },
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

describe('resetting the identity', () => {
  it('deletes the row and answers the default', async () => {
    const repo = repository();
    await expect(service(repo).reset('user-1')).resolves.toEqual(DEFAULT_ASSISTANT_IDENTITY);
    expect(repo.reset).toHaveBeenCalledWith('user-1');
  });
});
