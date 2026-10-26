import { describe, expect, it } from 'vitest';
import {
  clearStoredRecitation,
  readStoredRecitation,
  writeStoredRecitation,
  type StorageLike,
} from '@/frontend/shared/recitation/storage';

function memoryStorage(initial: Record<string, string> = {}): StorageLike & {
  value: Record<string, string>;
} {
  const value = { ...initial };
  return {
    value,
    getItem: (key) => value[key] ?? null,
    setItem: (key, next) => {
      value[key] = next;
    },
    removeItem: (key) => {
      delete value[key];
    },
  };
}

const POSITION = { surah: 2, name: 'البقرة', ayah: 14, ayahCount: 286, offset: 3.5 };

describe('the last position', () => {
  it('round-trips through storage', () => {
    const storage = memoryStorage();
    writeStoredRecitation(POSITION, storage);

    expect(readStoredRecitation(storage)).toEqual(POSITION);
    clearStoredRecitation(storage);
    expect(readStoredRecitation(storage)).toBeNull();
  });

  it('says nothing when there is no storage or no record', () => {
    expect(readStoredRecitation(null)).toBeNull();
    expect(readStoredRecitation(memoryStorage())).toBeNull();
  });

  it('refuses a record it cannot trust', () => {
    const broken = memoryStorage({
      'quran-player-v1': JSON.stringify({ ...POSITION, surah: 0 }),
    });
    expect(readStoredRecitation(broken)).toBeNull();

    const notJson = memoryStorage({ 'quran-player-v1': 'not json' });
    expect(readStoredRecitation(notJson)).toBeNull();

    const impossible = memoryStorage({
      'quran-player-v1': JSON.stringify({ ...POSITION, ayah: 300, ayahCount: 286 }),
    });
    expect(readStoredRecitation(impossible)).toBeNull();
  });

  it('does not let a refused storage break playback', () => {
    const refused: StorageLike = {
      getItem: () => {
        throw new Error('denied');
      },
      setItem: () => {
        throw new Error('denied');
      },
      removeItem: () => {
        throw new Error('denied');
      },
    };

    expect(readStoredRecitation(refused)).toBeNull();
    expect(() => writeStoredRecitation(POSITION, refused)).not.toThrow();
    expect(() => clearStoredRecitation(refused)).not.toThrow();
  });
});
