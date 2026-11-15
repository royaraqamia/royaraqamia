import type { ScreenScope } from '@/frontend/state/screen-scopes';

/**
 * What the Quran registers (ADR-0181, #1420).
 *
 * The index registers itself; the sura reader says which sura is open, and the
 * tafsir panel says which Ayah's study sits beside the text. None of them
 * publishes the member's marks, bookmarks or reading position: those are
 * device-local rows, and the question the snapshot answers is "which screen and
 * which sura", not "what have you saved".
 */
export function quranScreenScope(): ScreenScope {
  return { id: 'quran.page', kind: 'screen' };
}

export function quranSurahScreenScope(surah: number): ScreenScope {
  return {
    id: 'quran-surah.page',
    kind: 'screen',
    focus: { kind: 'surah', id: String(surah) },
  };
}

/** The tafsir open beside an Ayah, as a panel above the reader. */
export function quranTafsirScope(ayah: number | null): ScreenScope | null {
  if (ayah === null) return null;
  return {
    id: 'quran-surah.tafsir',
    kind: 'dialog',
    focus: { kind: 'ayah', id: String(ayah) },
  };
}
