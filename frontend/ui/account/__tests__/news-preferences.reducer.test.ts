import { describe, expect, it } from 'vitest';
import type { NewsSource } from '@/shared/contracts/news';
import {
  newsPreferencesInitialState,
  newsPreferencesReducer,
} from '@/frontend/ui/account/news-preferences.reducer';

const SOURCES: NewsSource[] = [
  { id: 'a', name: 'أ', category: 'tech', region: 'arab', tier: 1 },
  { id: 'b', name: 'ب', category: 'world', region: 'world', tier: 2 },
];

describe('newsPreferencesReducer', () => {
  it('starts loading with nothing ticked', () => {
    const state = newsPreferencesInitialState();

    expect(state.sources).toBeNull();
    expect(state.selected.size).toBe(0);
    expect(state.loading).toBe(true);
    expect(state.loadError).toBeNull();
    expect(state.saving).toBe(false);
  });

  it('settles the sources and the ticks together', () => {
    const state = newsPreferencesReducer(newsPreferencesInitialState(), {
      type: 'loadSucceeded',
      sources: SOURCES,
      selected: ['a', 'b'],
    });

    expect(state.sources).toEqual(SOURCES);
    expect([...state.selected]).toEqual(['a', 'b']);
    expect(state.loading).toBe(false);
  });

  it('names a failed read and stops loading', () => {
    const state = newsPreferencesReducer(newsPreferencesInitialState(), {
      type: 'loadFailed',
      error: 'تعذّر التحميل',
    });

    expect(state.loading).toBe(false);
    expect(state.loadError).toBe('تعذّر التحميل');
  });

  it('ticks and unticks one source without touching the rest', () => {
    const loaded = newsPreferencesReducer(newsPreferencesInitialState(), {
      type: 'loadSucceeded',
      sources: SOURCES,
      selected: ['a'],
    });

    const unticked = newsPreferencesReducer(loaded, { type: 'toggled', id: 'a' });
    expect([...unticked.selected]).toEqual([]);

    const ticked = newsPreferencesReducer(unticked, { type: 'toggled', id: 'b' });
    expect([...ticked.selected]).toEqual(['b']);
  });

  it('selects everything from the row ids', () => {
    const state = newsPreferencesReducer(newsPreferencesInitialState(), {
      type: 'allSelected',
      ids: ['a', 'b'],
    });

    expect([...state.selected]).toEqual(['a', 'b']);
  });

  it('raises and lowers the saving flag', () => {
    const started = newsPreferencesReducer(newsPreferencesInitialState(), {
      type: 'saveStarted',
    });
    expect(started.saving).toBe(true);

    expect(newsPreferencesReducer(started, { type: 'saveSettled' }).saving).toBe(false);
  });
});
