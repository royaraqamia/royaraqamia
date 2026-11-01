'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import { QURAN_PAGE_COUNT } from '@/shared/contracts/quran-pages';
import { toLatinDigits } from '@/shared/contracts/text';

/**
 * «انتقل إلى صفحة»: a printed page number, answered with the Ayah that opens it (P5).
 *
 * The pages are exact even though the page *view* is not built — the KFGQPC layout
 * that would set a page per screen waits on a licence answer, and a jump to a page's
 * first Ayah needs none of it. So the control ships, and it lands where the reader
 * can see they arrived: `#ayah-N`, which the sura route marks.
 *
 * The field is `type="text"` on purpose: an `<input type="number">` discards the
 * Arabic-Indic digits an Arabic-locale keyboard produces, so the reader would type a
 * page and be told it is out of range. `inputMode="numeric"` still asks a phone for
 * the number pad, and the range is checked here instead of by the browser.
 *
 * `pages` is flat — `[surah, ayah, surah, ayah, …]` — because it crosses the
 * server/client boundary and 1,208 numbers are cheaper than 604 objects.
 */
export function PageJump({ pages }: { pages: readonly number[] }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [invalid, setInvalid] = useState(false);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const page = Number(toLatinDigits(value).trim());
    if (!Number.isInteger(page) || page < 1 || page > QURAN_PAGE_COUNT) {
      setInvalid(true);
      return;
    }

    const surah = pages[(page - 1) * 2];
    const ayah = pages[(page - 1) * 2 + 1];
    if (surah === undefined || ayah === undefined) {
      // The control is drawn from the same map it reads; a miss is a build without
      // boundaries, and saying so is better than navigating nowhere.
      setInvalid(true);
      return;
    }

    setInvalid(false);
    router.push(`/quran/${surah}#ayah-${ayah}`);
  };

  return (
    <form
      onSubmit={submit}
      className="page-jump"
      aria-label="انتقل إلى صفحة"
      // The field's own message is Arabic and says the range; the browser's bubble
      // would speak the page's language and stop at the first control.
      noValidate
    >
      <label htmlFor="quran-page" className="page-jump-label">
        انتقل إلى صفحة
      </label>
      <div className="page-jump-row">
        <input
          id="quran-page"
          name="page"
          type="text"
          inputMode="numeric"
          value={value}
          onChange={(event) => {
            setValue(event.target.value);
            setInvalid(false);
          }}
          placeholder={`1 – ${QURAN_PAGE_COUNT}`}
          aria-invalid={invalid}
          aria-describedby={invalid ? 'quran-page-error' : undefined}
          className="page-jump-field"
        />
        <button type="submit" className="page-jump-submit">
          انتقال
        </button>
      </div>
      {invalid ? (
        <p id="quran-page-error" className="page-jump-error" role="alert">
          الصفحة من 1 إلى {QURAN_PAGE_COUNT}.
        </p>
      ) : null}
    </form>
  );
}
