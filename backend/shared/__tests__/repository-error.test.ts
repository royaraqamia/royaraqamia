import { describe, it, expect, vi } from 'vitest';

vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
vi.mock('@/backend/shared/logger', () => ({ logger: { error: vi.fn() } }));

import {
  RepositoryError,
  guardRepositoryMethods,
  isNotFoundError,
  isRangeNotSatisfiableError,
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

describe('isRangeNotSatisfiableError', () => {
  // #1369: a page past the last row is an empty answer, not a failed read.
  it('recognises the 416 PostgREST raises for a range past the last row', () => {
    expect(
      isRangeNotSatisfiableError({
        message: 'Requested range not satisfiable',
        code: 'PGRST103',
      })
    ).toBe(true);
  });

  it('recognises it by its sentence when the body carried no code', () => {
    expect(isRangeNotSatisfiableError(new Error('Requested range not satisfiable'))).toBe(true);
  });

  it('leaves every other read failure as a failure', () => {
    expect(isRangeNotSatisfiableError({ message: 'db down', code: 'PGRST500' })).toBe(false);
    expect(isRangeNotSatisfiableError(new Error('connection reset'))).toBe(false);
    expect(isNotFoundError({ message: 'no rows', code: 'PGRST116' })).toBe(true);
  });
});
