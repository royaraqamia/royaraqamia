import { createHash } from 'node:crypto';
import { test, expect, type Page } from '@playwright/test';

/**
 * A kept recitation, with the radio off (#559, ADR-0081).
 *
 * The bytes are synthetic for the same reason `quran-audio.spec.ts` stubs them:
 * CI must not depend on the bucket. But this store *verifies* every file against
 * the manifest's `sha256` before it keeps it, so the stub is a synthetic
 * manifest whose hashes match the stub bytes — a silent WAV would fail the
 * download, which is the point of the check.
 *
 * The host stays `audio.royaraqamia.com` because that is the one origin the CSP
 * allows; only the responses are intercepted.
 */

const HOST = 'https://audio.royaraqamia.com';
const EDITION = 'ar.alafasy';

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

const AUDIO = silentWav(1);
const SHA = createHash('sha256').update(AUDIO).digest('hex');

const MANIFEST = {
  edition: EDITION,
  surah: 1,
  name: 'الفاتحة',
  ayahCount: 2,
  bytes: AUDIO.length * 2,
  files: [1, 2].map((ayah) => ({
    ayah,
    key: `${EDITION}/001/${String(ayah).padStart(3, '0')}.mp3`,
    bytes: AUDIO.length,
    sha256: SHA,
  })),
};

/** The edition's own manifest, which names the host the Ayat are fetched from. */
const INDEX = {
  source: 'test',
  license: 'test',
  attribution: 'test',
  editions: [
    {
      id: EDITION,
      reciter: 'مشاري راشد العفاسي',
      reciterLatin: 'Mishary Rashid Alafasy',
      style: 'Murattal',
      bitrateKbps: 64,
      container: 'mp3',
      baseUrl: HOST,
      sourceUrl: `${HOST}/{ayah}.mp3`,
      attributionLine: 'test',
      suras: 114,
      ayat: 6236,
      bytes: AUDIO.length,
      complete: true,
    },
  ],
};

interface Recitation {
  /** The radio goes off: the host and the manifests both disappear. */
  goOffline: () => void;
}

async function stubRecitation(page: Page): Promise<Recitation> {
  let online = true;

  await page.route('**/quran/audio/**', (route) => {
    if (!online) return route.abort('internetdisconnected');
    const path = new URL(route.request().url()).pathname;
    return route.fulfill({ json: path.endsWith('/index.json') ? INDEX : MANIFEST });
  });

  await page.route(`${HOST}/**`, (route) => {
    if (!online) return route.abort('internetdisconnected');
    // The bucket sends this for `https://royaraqamia.com` and `localhost:3000`
    // (ADR-0081); a fulfilled response has to say so too, or the page's
    // cross-origin fetch is refused before its bytes are ever checked.
    return route.fulfill({
      status: 200,
      contentType: 'audio/wav',
      headers: { 'access-control-allow-origin': '*' },
      body: AUDIO,
    });
  });

  return {
    goOffline: () => {
      online = false;
    },
  };
}

// Playing a kept Ayah starts the queue for the next one without a fresh
// gesture, which Chromium's default autoplay policy may refuse.
test.use({ launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] } });

test('a kept surah plays from the device with the radio off', async ({ context, page }) => {
  const recitation = await stubRecitation(page);
  await page.goto('/quran/1');

  // Wait for the player to have read what this device holds — that is also the
  // point at which its handlers work, so a click cannot land on server markup.
  const player = page.getByRole('region', { name: 'تلاوة السُّورة' });
  await expect(player).toHaveAttribute('data-audio-state', 'none');

  // Consent first: nothing is fetched until this press.
  const keep = page.getByRole('button', { name: /حفظ التِّلاوة/ });
  await keep.click();

  await expect(page.getByText(/محفوظة على هذا الجُهاز/)).toBeVisible({ timeout: 30_000 });

  recitation.goOffline();
  await context.setOffline(true);

  await page.getByRole('button', { name: 'استمع للسُّورة' }).click();

  // A `blob:` source is the device's own copy — the host it was served from is
  // unreachable, and the manifest that names the files came from the index.
  await expect(page.locator('audio')).toHaveAttribute('src', /^blob:/, { timeout: 30_000 });
  await expect(page.getByText(/غير محفوظة على هذا الجُهاز/)).toHaveCount(0);
});

test('a surah this device does not hold says it needs a connection', async ({ context, page }) => {
  const recitation = await stubRecitation(page);
  await page.goto('/quran/1');

  // The reader never pressed keep, so there is no copy and no kept manifest.
  const player = page.getByRole('region', { name: 'تلاوة السُّورة' });
  await expect(player).toHaveAttribute('data-audio-state', 'none');

  recitation.goOffline();
  await context.setOffline(true);

  await page.getByRole('button', { name: 'استمع للسُّورة' }).click();

  await expect(page.getByText(/هذه السُّورة غير محفوظة على هذا الجُهاز/)).toBeVisible({
    timeout: 30_000,
  });
});
