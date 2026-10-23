import { describe, expect, it, vi } from 'vitest';

import type { NewsPreferencesRepository } from '@/backend/repositories/news/news-preferences-repository';
import { listFileSources } from '@/backend/services/news/news-catalogue';
import { createNewsPreferencesService } from '@/backend/services/news/news-preferences-service';
import type { NewsSource } from '@/shared/contracts/news';

function repository(overrides: Partial<NewsPreferencesRepository> = {}): NewsPreferencesRepository {
  return {
    getSourceIds: vi.fn(async () => null),
    saveSourceIds: vi.fn(async () => undefined),
    ...overrides,
  } satisfies NewsPreferencesRepository;
}

/** The repo list plus one approved source, the way the catalogue merges them. */
const CATALOGUE: NewsSource[] = [
  ...listFileSources(),
  { id: 'example-com', name: 'مثال', category: 'world', region: 'world', tier: 2 },
];

const catalogue = { list: vi.fn(async () => CATALOGUE) };

describe('news preferences service', () => {
  it('reports no selection for an account that never chose', async () => {
    const service = createNewsPreferencesService(repository(), catalogue);
    expect(await service.get('user-1')).toEqual([]);
  });

  it('keeps the stored ids in catalogue order and drops retired ones', async () => {
    const [first, second] = listFileSources();
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    const repo = repository({
      getSourceIds: vi.fn(async () => [second!.id, 'retired-source', first!.id]),
    });

    expect(await createNewsPreferencesService(repo, catalogue).get('user-1')).toEqual([
      first!.id,
      second!.id,
    ]);
  });

  it('sanitises before storing, so an unknown id is never persisted', async () => {
    const [first] = listFileSources();
    expect(first).toBeDefined();

    const repo = repository();
    const kept = await createNewsPreferencesService(repo, catalogue).save('user-1', [
      'not-a-source',
      first!.id,
      first!.id,
    ]);

    expect(kept).toEqual([first!.id]);
    expect(repo.saveSourceIds).toHaveBeenCalledWith('user-1', [first!.id]);
  });

  it('accepts a source an admin approved after the reader saved a selection', async () => {
    const repo = repository();

    const kept = await createNewsPreferencesService(repo, catalogue).save('user-1', [
      'example-com',
    ]);

    expect(kept).toEqual(['example-com']);
  });

  it('stores an empty selection as "every source"', async () => {
    const repo = repository();
    const kept = await createNewsPreferencesService(repo, catalogue).save('user-1', []);

    expect(kept).toEqual([]);
    expect(repo.saveSourceIds).toHaveBeenCalledWith('user-1', []);
  });
});
