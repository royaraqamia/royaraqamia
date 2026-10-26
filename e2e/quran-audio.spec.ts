import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, expect, type Page } from '@playwright/test';

/**
 * The Recitation, in a real browser (ADR-0062).
 *
 * The manifests are the ones committed in this repository, served by stub
 * routes; only the audio bytes are synthetic, because the real files live in the
 * bucket and CI must not depend on a network host to prove a queue advances.
 *
 * The stub is a silent WAV rather than an MP3 so that it genuinely decodes and
 * genuinely ends: the point of the spec is the transition from one Ayah to the
 * next, which only an `ended` event can cause.
 */

const MANIFEST_DIR = join(process.cwd(), 'public', 'quran', 'audio', 'ar.alafasy');
const INDEX = JSON.parse(readFileSync(join(MANIFEST_DIR, 'index.json'), 'utf8'));
const SURAH_ONE = JSON.parse(readFileSync(join(MANIFEST_DIR, '001.json'), 'utf8'));
const FIRST = SURAH_ONE.files[0];
const SECOND = SURAH_ONE.files[1];

/**
 * The highest-numbered Surah whose manifest is not on disk — the Surah to point
 * the absence test at — or null once every Surah is vendored.
 *
 * `index.json` counts the vendored Suras but does not name them (ADR-0062), so
 * the manifests are the only statement of which ones exist. Highest rather than
 * lowest because the vendoring script works upward from Al-Fatiha: the first gap
 * is the one about to be filled, and the last gap is filled only once every
 * other Surah is already in.
 */
function highestSurahWithoutRecitation(): number | null {
  for (let sura = 114; sura >= 1; sura -= 1) {
    if (!existsSync(join(MANIFEST_DIR, `${String(sura).padStart(3, '0')}.json`))) return sura;
  }
  return null;
}

const unvendoredSura = highestSurahWithoutRecitation();

// Each file is short and the queue plays the next one without a fresh gesture,
// which Chromium's default autoplay policy is entitled to refuse.
test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

function silentWav(seconds = 0.3): Buffer {
  const sampleRate = 8000;
  const samples = Math.floor(sampleRate * seconds);
  const data = Buffer.alloc(samples * 2);
  const header = Buffer.alloc(44);

  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); // PCM
  header.writeUInt16LE(1, 22); // mono
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);

  return Buffer.concat([header, data]);
}

async function stubRecitation(page: Page): Promise<string[]> {
  const played: string[] = [];

  await page.route('**/quran/audio/ar.alafasy/index.json', (route) =>
    route.fulfill({ json: INDEX })
  );
  await page.route('**/quran/audio/ar.alafasy/001.json', (route) =>
    route.fulfill({ json: SURAH_ONE })
  );
  await page.route('https://audio.royaraqamia.com/**', (route) => {
    played.push(route.request().url());
    return route.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav(2) });
  });

  return played;
}

test('plays a sura one Ayah file after another, from the host the manifest names', async ({
  page,
}) => {
  const played = await stubRecitation(page);
  await page.goto('/quran/1');

  const play = page.getByRole('button', { name: 'استمع للسُّورة' });
  await expect(play).toBeVisible();
  await play.click();

  const firstAyah = page.locator('#ayah-1');
  const secondAyah = page.locator('#ayah-2');

  await expect(firstAyah).toHaveAttribute('aria-current', 'true');
  await expect(secondAyah).not.toHaveAttribute('aria-current');

  const audio = page.locator('[data-quran-audio]');
  await expect(audio).toHaveAttribute(
    'src',
    `https://audio.royaraqamia.com/${FIRST.key}?v=${FIRST.sha256.slice(0, 8)}`
  );

  // The first file ends, and the second begins — the queue, not a playlist. It
  // was fetched while the first played, so it starts from a local blob.
  await expect(secondAyah).toHaveAttribute('aria-current', 'true', { timeout: 15_000 });
  await expect(audio).toHaveAttribute('src', /^blob:/);
  await expect(firstAyah).not.toHaveAttribute('aria-current');
  expect(played.some((url) => url.includes(SECOND.key))).toBe(true);
});

test('offers no player for a sura with no vendored recitation', async ({ page }) => {
  // Once the whole Quran is vendored there is no such Surah left to request, and
  // the absence itself is still covered in `frontend/ui/__tests__/quran.test.tsx`
  // (`SurahReader` with no Recitation renders neither control). What this spec
  // adds is the wiring the unit test cannot see: the loader reading the manifest,
  // the page passing it down, the reader honouring it.
  test.skip(
    unvendoredSura === null,
    'every Surah has a vendored Recitation, so the absence cannot be served'
  );

  await page.goto(`/quran/${unvendoredSura}`);

  await expect(page.getByRole('region', { name: 'تلاوة السُّورة' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'استمع للسُّورة' })).toHaveCount(0);
});

test('keeps the recitation playing across a page navigation', async ({ page }) => {
  const played = await stubRecitation(page);
  await page.goto('/quran/1');

  await page.getByRole('button', { name: 'استمع للسُّورة' }).click();
  await expect(page.getByRole('button', { name: 'إيقاف مؤقّت' })).toBeVisible();

  // The lock screen's title comes from the Media Session, not from the page.
  await expect
    .poll(() => page.evaluate(() => navigator.mediaSession.metadata?.title ?? null))
    .toBe('سورة الفاتحة');

  // The back control is a client-side navigation. Nothing in the reader owns the
  // element, so the sound survives it (ADR-0085).
  await page.getByRole('button', { name: 'رجوع' }).click();
  await page.waitForURL('**/quran');

  const bar = page.getByRole('region', { name: 'مُشغِّل التِّلاوة' });
  await expect(bar).toBeVisible();
  await expect(bar.getByText('سورة الفاتحة')).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => (document.querySelector('[data-quran-audio]') as HTMLAudioElement | null)?.paused
      )
    )
    .toBe(false);
  expect(played.length).toBeGreaterThan(0);

  // The bar returns to the Ayah that is playing.
  await bar.getByRole('link').click();
  await page.waitForURL('**/quran/1#ayah-*');
  await expect(page.getByRole('region', { name: 'تلاوة السُّورة' })).toBeVisible();
  await page.getByRole('button', { name: 'إيقاف التِّلاوة' }).click();
});

test('comes back paused on the same sura after a reload', async ({ page }) => {
  await stubRecitation(page);
  await page.goto('/quran/1');

  await page.getByRole('button', { name: 'استمع للسُّورة' }).click();
  await expect(page.getByRole('button', { name: 'إيقاف مؤقّت' })).toBeVisible();

  await page.reload();

  // The float is the control on this sura's own reader; the mini player is the
  // same state seen from another page.
  const resume = page.getByRole('button', { name: 'متابعة' });
  await expect(resume).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => (document.querySelector('[data-quran-audio]') as HTMLAudioElement | null)?.paused
      )
    )
    .toBe(true);

  await resume.click();
  await expect(page.getByRole('button', { name: 'إيقاف مؤقّت' })).toBeVisible();
});
