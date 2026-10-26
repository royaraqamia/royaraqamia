/**
 * Where the recitation last was when the page went away.
 *
 * This is deliberately not the Local Store: it is one small record, it is read
 * synchronously before the first paint of the mini player, and it is not a copy
 * of the audio. A browser that refuses storage (private mode, a blocked origin)
 * simply gets no resume, which is the state the app had before this existed.
 */
export interface StoredRecitation {
  readonly surah: number;
  /** The sura's name, so the mini player can name it without a manifest fetch. */
  readonly name: string;
  readonly ayah: number;
  readonly ayahCount: number;
  /** Seconds into that Ayah. */
  readonly offset: number;
}

const STORAGE_KEY = 'quran-player-v1';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

export function browserStorage(): StorageLike | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function isStoredRecitation(value: unknown): value is StoredRecitation {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    Number.isInteger(record.surah) &&
    (record.surah as number) >= 1 &&
    (record.surah as number) <= 114 &&
    Number.isInteger(record.ayah) &&
    (record.ayah as number) >= 1 &&
    Number.isInteger(record.ayahCount) &&
    (record.ayahCount as number) >= (record.ayah as number) &&
    typeof record.name === 'string' &&
    record.name.length > 0 &&
    typeof record.offset === 'number' &&
    Number.isFinite(record.offset) &&
    record.offset >= 0
  );
}

/** The last position, or null when there is none to trust. */
export function readStoredRecitation(
  storage: StorageLike | null = browserStorage()
): StoredRecitation | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    return isStoredRecitation(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function writeStoredRecitation(
  value: StoredRecitation,
  storage: StorageLike | null = browserStorage()
): void {
  if (!storage) return;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // A full or refused storage is not a playback failure.
  }
}

export function clearStoredRecitation(storage: StorageLike | null = browserStorage()): void {
  if (!storage) return;
  try {
    storage.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to recover from.
  }
}
