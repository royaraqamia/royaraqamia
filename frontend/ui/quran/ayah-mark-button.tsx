import { Bookmark } from 'lucide-react';

import { QURAN_AYAH_MARK_COPY } from './ayah-mark-button-copy';

/**
 * The fallback a refused mark shows, shared with the app (#1751). It stays a
 * module constant rather than an attribute on every Ayah: the sura's HTML is a
 * budgeted surface, and 286 copies of one sentence do not belong in it.
 */
export const AYAH_MARK_SAVE_FAILED = QURAN_AYAH_MARK_COPY.saveFailed;

/**
 * The control that saves an Ayah, beside its number.
 *
 * It lives in its own file so `surah-reader.tsx` does not import the icon
 * library: the reader is the component the app's parity row names, and a glyph
 * inside a client-only control is not part of the layout contract.
 *
 * The words come from `shared/copy/quran-ayah-mark.json`, the same source the
 * app's mark control reads (#1751): a label cannot be right on one client and
 * wrong on the other.
 */
export function AyahMarkButton({ number }: { number: number }) {
  return (
    <button
      type="button"
      data-bookmark-ayah={number}
      aria-pressed="false"
      disabled
      aria-label={QURAN_AYAH_MARK_COPY.markAyah.replace('{ayah}', String(number))}
      title={QURAN_AYAH_MARK_COPY.markTitle}
      className="ayah-mark"
    >
      <Bookmark aria-hidden="true" />
    </button>
  );
}
