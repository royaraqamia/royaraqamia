import { describe, it, expect, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/backend/shared/logger', () => ({ logger: { error: vi.fn() } }));

import {
  RepositoryError,
  guardRepositoryMethods,
  isRepositoryError,
} from '@/backend/shared/repository-error';

describe('guardRepositoryMethods', () => {
  it('wraps a thrown non-repository error as a RepositoryError', async () => {
    const repository = guardRepositoryMethods({
      async fail(): Promise<void> {
        throw new Error('connection reset');
      },
      constant: 42,
    });

    await expect(repository.fail()).rejects.toBeInstanceOf(RepositoryError);
    expect(repository.constant).toBe(42);
  });

  it('passes an existing RepositoryError through untouched', async () => {
    const original = new RepositoryError('op', new Error('x'));
    const repository = guardRepositoryMethods({
      async fail(): Promise<void> {
        throw original;
      },
    });

    await expect(repository.fail()).rejects.toBe(original);
  });

  it('marks the wrapper result as a repository error', async () => {
    const repository = guardRepositoryMethods({
      async fail(): Promise<void> {
        throw new Error('boom');
      },
    });

    await repository.fail().catch((error) => {
      expect(isRepositoryError(error)).toBe(true);
    });
  });
});
