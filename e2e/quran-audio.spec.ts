import { readFileSync } from 'node:fs';
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
    return route.fulfill({ status: 200, contentType: 'audio/wav', body: silentWav() });
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

  const audio = page.locator('audio');
  await expect(audio).toHaveAttribute(
    'src',
    `https://audio.royaraqamia.com/${FIRST.key}?v=${FIRST.sha256.slice(0, 8)}`
  );

  // The first file ends, and the second begins — the queue, not a playlist.
  await expect(audio).toHaveAttribute(
    'src',
    `https://audio.royaraqamia.com/${SECOND.key}?v=${SECOND.sha256.slice(0, 8)}`,
    { timeout: 15_000 }
  );
  expect(played.length).toBeGreaterThanOrEqual(2);
});

test('offers no player for a sura with no vendored recitation', async ({ page }) => {
  await page.goto('/quran/2');

  await expect(page.getByRole('region', { name: 'تلاوة السُّورة' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'استمع للسُّورة' })).toHaveCount(0);
});
