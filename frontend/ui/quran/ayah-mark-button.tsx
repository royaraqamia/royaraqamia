import { Bookmark } from 'lucide-react';

/**
 * The control that saves an Ayah, beside its number.
 *
 * It lives in its own file so `surah-reader.tsx` does not import the icon
 * library: the reader is the component the app's parity row names, and a glyph
 * inside a client-only control is not part of the layout contract.
 */
export function AyahMarkButton({ number }: { number: number }) {
  return (
    <button
      type="button"
      data-bookmark-ayah={number}
      aria-pressed="false"
      disabled
      aria-label={`علامة على الآية ${number}`}
      title="إضافة علامة أو إزالتها"
      className="ayah-mark"
    >
      <Bookmark aria-hidden="true" />
    </button>
  );
}
