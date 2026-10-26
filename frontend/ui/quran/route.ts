/**
 * Which sura a path is the reader of. `/quran` is the index, `/quran/12` one
 * sura, and anything else is neither — the mini player is hidden only on the
 * reader of the sura it is already playing.
 */
export function readerSurahFromPath(pathname: string | null | undefined): number | null {
  const match = /^\/quran\/(\d{1,3})\/?$/.exec(pathname ?? '');
  if (!match) return null;
  const value = match[1];
  if (!value) return null;
  const surah = Number(value);
  return Number.isInteger(surah) && surah >= 1 && surah <= 114 ? surah : null;
}
