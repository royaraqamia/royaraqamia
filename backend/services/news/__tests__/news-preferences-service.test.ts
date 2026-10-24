import { describe, expect, it, vi } from 'vitest';

import type { NewsPreferencesRepository } from '@/backend/repositories/news/news-preferences-repository';
import { listFileSources } from '@/backend/services/news/news-catalogue';
import { createNewsPreferencesService } from '@/backend/services/news/news-preferences-service';
import type { NewsSource } from '@/shared/contracts/news';

function repository(overrides: Partial<NewsPreferencesRepository> = {}): NewsPreferencesRepository {
  return {
    getPreferences: vi.fn(async () => null),
    savePreferences: vi.fn(async () => undefined),
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
    expect(await service.get('user-1')).toEqual({ sourceIds: [], personalEnabled: false });
  });

  it('keeps the stored ids in catalogue order and drops retired ones', async () => {
    const [first, second] = listFileSources();
    expect(first).toBeDefined();
    expect(second).toBeDefined();

    const repo = repository({
      getPreferences: vi.fn(async () => ({
        sourceIds: [second!.id, 'retired-source', first!.id],
        personalEnabled: true,
      })),
    });

    expect(await createNewsPreferencesService(repo, catalogue).get('user-1')).toEqual({
      sourceIds: [first!.id, second!.id],
      personalEnabled: true,
    });
  });

  it('sanitises before storing, so an unknown id is never persisted', async () => {
    const [first] = listFileSources();
    expect(first).toBeDefined();

    const repo = repository();
    const saved = await createNewsPreferencesService(repo, catalogue).save('user-1', {
      sourceIds: ['not-a-source', first!.id, first!.id],
      personalEnabled: false,
    });

    expect(saved.sourceIds).toEqual([first!.id]);
    expect(repo.savePreferences).toHaveBeenCalledWith('user-1', {
      sourceIds: [first!.id],
      personalEnabled: false,
    });
  });

  it('accepts a source an admin approved after the reader saved a selection', async () => {
    const repo = repository();

    const saved = await createNewsPreferencesService(repo, catalogue).save('user-1', {
      sourceIds: ['example-com'],
      personalEnabled: false,
    });

    expect(saved.sourceIds).toEqual(['example-com']);
  });

  it('leaves the opt-in alone when the caller only edits the checklist', async () => {
    const repo = repository({
      getPreferences: vi.fn(async () => ({ sourceIds: [], personalEnabled: true })),
    });

    const saved = await createNewsPreferencesService(repo, catalogue).save('user-1', {
      sourceIds: [],
    });

    expect(saved.personalEnabled).toBe(true);
    expect(repo.savePreferences).toHaveBeenCalledWith('user-1', {
      sourceIds: [],
      personalEnabled: true,
    });
  });

  it('stores an empty selection as "every source"', async () => {
    const repo = repository();
    const saved = await createNewsPreferencesService(repo, catalogue).save('user-1', {
      sourceIds: [],
      personalEnabled: false,
    });

    expect(saved.sourceIds).toEqual([]);
    expect(repo.savePreferences).toHaveBeenCalledWith('user-1', {
      sourceIds: [],
      personalEnabled: false,
    });
  });
});
