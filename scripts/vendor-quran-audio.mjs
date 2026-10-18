/**
 * Vendors a Quran Recitation into our own storage (ADR-0062).
 *
 * The reader streams Recitation from a host we control rather than calling a
 * third party at read time, for the same reason the text is vendored (ADR-0057):
 * a third party in the path of a page view is a dependency we cannot verify from
 * here, and this source sends no CORS header, so a browser could not cache its
 * files for offline use even if we wanted to.
 *
 * Two things make this a copier and never an editor:
 *   - The bytes are uploaded exactly as published. No transcode, no loudness
 *     pass, no trimming. The licence is bounded to "the bitrates we publish", so
 *     choosing our own bitrate would step outside the permission we rely on, and
 *     a loudness pass would alter the recitation.
 *   - Every file is checked to be the same codec, sample rate and bitrate before
 *     anything is uploaded. A set that disagrees with itself is a corrupt set,
 *     and it fails here rather than in a reader's ear.
 *
 * What is committed is the manifest, never the audio: `public/quran/audio/<id>/`
 * holds an `index.json` naming the editions and one `<surah>.json` per Surah with
 * a sha256 and a size for each Ayah file. The audio lives in the bucket, and the
 * reader composes its URL from the manifest — so the host can move without
 * touching a single reader, and a takedown is a new revision rather than an
 * orchestrated cache purge.
 *
 * Usage:
 *   node scripts/vendor-quran-audio.mjs                    # every Surah, uploads
 *   node scripts/vendor-quran-audio.mjs --surah 1           # one Surah
 *   node scripts/vendor-quran-audio.mjs --surah 1,114       # a few
 *   node scripts/vendor-quran-audio.mjs --dry-run           # fetch and verify, no upload
 *   node scripts/vendor-quran-audio.mjs --force             # re-upload everything
 *
 * Needs R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY and R2_BUCKET in the environment
 * or in `.env`, plus the bucket's S3 endpoint as R2_ENDPOINT (or an R2_ACCOUNT_ID
 * to derive it from — the endpoint is preferred, because it is copied rather than
 * assembled).
 */
import { createHash, createHmac } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const ENV_FILE = join(process.cwd(), '.env');
const TEXT_INDEX = join(process.cwd(), 'public', 'quran', 'meta', 'index.json');
const AUDIO_DIR = join(process.cwd(), 'public', 'quran', 'audio');

/**
 * The published set, as ADR-0062 records it: Alafasy's Murattal, 64 kbps, one
 * file per Ayah, exactly as the CDN serves it. The CDN numbers the Ayat 1–6236
 * globally; we re-key them to Surah/Ayah so a Surah's files sit under one prefix
 * and an offline download of a Surah is one contiguous set.
 */
const DEFAULTS = {
  edition: 'ar.alafasy',
  reciter: 'مشاري راشد العفاسي',
  reciterLatin: 'Mishary Rashid Alafasy',
  style: 'Murattal',
  bitrate: 64,
  concurrency: 6,
  attempts: 4,
};

const CDN = 'https://cdn.islamic.network';
const SOURCE_LICENSE =
  'Licensed to AlQuran Cloud / Islamic Network by the reciters or their estates for free, ' +
  'non-commercial redistribution at the bitrates they publish.';
const ATTRIBUTION = 'مشاري راشد العفاسي · AlQuran Cloud (https://alquran.cloud)';

/** The CDN's published bitrates; anything else is not a bitrate they publish. */
const PUBLISHED_BITRATES = new Set([32, 40, 48, 64, 128, 192]);
/** Edition ids are `ll.slug`; anything else is not an edition the CDN serves. */
const EDITION_PATTERN = /^[a-z]{2}\.[a-z0-9][a-z0-9-]*$/;
/** The Quran is 6236 Ayat; a number outside that is a bug, not a request. */
const AYAH_COUNT = 6236;

/** One Ayah must never be cached as if it could change; its URL carries its hash. */
const CACHE_CONTROL = 'public, max-age=31536000, immutable';
const CONTENT_TYPE = 'audio/mpeg';

// --- Arguments --------------------------------------------------------------

function parseArgs(argv) {
  const options = { ...DEFAULTS, suras: null, dryRun: false, force: false, names: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--force') options.force = true;
    else if (arg === '--edition') options.edition = argv[++i];
    else if (arg === '--bitrate') options.bitrate = Number(argv[++i]);
    else if (arg === '--concurrency') options.concurrency = Number(argv[++i]);
    else if (arg === '--surah') {
      options.suras = String(argv[++i] ?? '')
        .split(',')
        .map((value) => Number(value.trim()))
        .filter((value) => Number.isInteger(value) && value >= 1 && value <= 114);
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

// --- Environment ------------------------------------------------------------

/**
 * Reads `.env` for the operator's convenience, but never over a variable that is
 * already in the environment — CI and a real shell both win over the file.
 */
function loadEnvFile(path) {
  let contents;
  try {
    contents = readFileSync(path, 'utf8');
  } catch (error) {
    if (error.code === 'ENOENT') return;
    throw error;
  }
  for (const line of contents.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    const [, name, raw] = match;
    if (process.env[name] !== undefined) continue;
    process.env[name] = raw.trim().replace(/^["']|["']$/g, '');
  }
}

function requireCredentials() {
  const names = ['R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY', 'R2_BUCKET'];
  const missing = names.filter((name) => !process.env[name]);

  // The dashboard's copy button hands out the *bucket's* URL, bucket name and
  // all, so only the origin is kept: every key already carries its bucket, and a
  // path left in place is signed once and sent twice, which fails as a signature
  // mismatch that reads like a wrong secret.
  const origin = (() => {
    const raw = (process.env.R2_ENDPOINT ?? '').trim();
    if (raw) {
      let url;
      try {
        url = new URL(raw);
      } catch {
        // The value is never echoed: this file's whole point is that env values
        // are secrets, and only the operator knows what they set.
        throw new Error('R2_ENDPOINT is not a URL');
      }
      // This script only ever talks to R2, so the endpoint is pinned rather than
      // trusted: an https origin under r2.cloudflarestorage.com. Anything else
      // is a typo, or an environment trying to make the upload go elsewhere.
      if (url.protocol !== 'https:' || !url.hostname.endsWith('.r2.cloudflarestorage.com')) {
        throw new Error('R2_ENDPOINT must be an https URL under r2.cloudflarestorage.com');
      }
      if (url.pathname !== '/' && url.pathname !== '') {
        // The copy button's URL names the bucket in its path, and every key
        // already carries the bucket, so the path is dropped. Said out loud,
        // because the alternative is a signature mismatch that reads like a
        // wrong secret key.
        console.warn(
          'R2_ENDPOINT named a path; the bucket is added to every key, so only the origin is used'
        );
      }
      return url.origin;
    }
    const accountId = (process.env.R2_ACCOUNT_ID ?? '').trim();
    if (!accountId) return '';
    // A Cloudflare account id is 32 hexadecimal characters. A truncated one is a
    // hostname that resolves and then cannot complete a handshake, which is the
    // least actionable failure there is, so it is refused here instead.
    if (!/^[0-9a-f]{32}$/i.test(accountId)) {
      throw new Error(
        'R2_ACCOUNT_ID is not 32 hex characters — copy the bucket’s S3 endpoint ' +
          'into R2_ENDPOINT instead'
      );
    }
    return `https://${accountId}.r2.cloudflarestorage.com`;
  })();

  if (!origin) missing.push('R2_ENDPOINT or R2_ACCOUNT_ID');
  if (missing.length > 0) {
    // The names are spelled out rather than echoed from the environment, because
    // this message ends up in a log.
    throw new Error(
      'Set R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET and R2_ENDPOINT ' +
        '(or R2_ACCOUNT_ID) in .env or the environment'
    );
  }
  return {
    endpoint: origin,
    host: new URL(origin).host,
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    bucket: process.env.R2_BUCKET,
  };
}

// --- MP3 frame inspection ---------------------------------------------------

const MPEG1_LAYER3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320];
const MPEG2_LAYER3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160];
const SAMPLE_RATES = {
  3: [44100, 48000, 32000],
  2: [22050, 24000, 16000],
  0: [11025, 12000, 8000],
};
const VERSION_NAMES = { 3: 'MPEG-1', 2: 'MPEG-2', 0: 'MPEG-2.5' };

/**
 * The first real MPEG audio frame header in a buffer, or null.
 *
 * Reading it is how the script proves the set is uniform without decoding a
 * single sample: every file in a published set must agree on version, layer,
 * sample rate and bitrate, or the reader would hear the seams.
 */
function readFrameHeader(buffer) {
  for (let i = 0; i + 4 <= buffer.length; i += 1) {
    if (buffer[i] !== 0xff || (buffer[i + 1] & 0xe0) !== 0xe0) continue;
    const versionBits = (buffer[i + 1] >> 3) & 0x03;
    const layerBits = (buffer[i + 1] >> 1) & 0x03;
    const bitrateIndex = (buffer[i + 2] >> 4) & 0x0f;
    const sampleRateIndex = (buffer[i + 2] >> 2) & 0x03;
    if (versionBits === 1 || layerBits === 0 || bitrateIndex === 0 || bitrateIndex === 15) continue;
    const table = versionBits === 3 ? MPEG1_LAYER3 : MPEG2_LAYER3;
    const sampleRate = SAMPLE_RATES[versionBits]?.[sampleRateIndex];
    if (!sampleRate) continue;
    return {
      version: VERSION_NAMES[versionBits],
      layer: 4 - layerBits,
      kbps: table[bitrateIndex],
      sampleRate,
    };
  }
  return null;
}

/** A stable description of the codec, so two files can be compared. */
function describeFrame(frame) {
  return `${frame.version} Layer ${frame.layer} ${frame.kbps} kbps ${frame.sampleRate} Hz`;
}

// --- Source -----------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetches one Ayah, retrying transient failures. The CDN asks for aggressive
 * caching rather than tolerance of a hot loop, so this is deliberately patient.
 */
async function fetchAyah(url, attempts) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${response.status} ${response.statusText}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length === 0) throw new Error('empty body');
      return bytes;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await sleep(500 * 2 ** (attempt - 1));
    }
  }
  throw new Error(`${url}: ${lastError?.message ?? 'failed'}`);
}

/** Runs `worker` over `items`, `limit` at a time, preserving order. */
async function mapLimit(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

// --- R2 (S3 API, SigV4) -----------------------------------------------------

function sha256Hex(data) {
  return createHash('sha256').update(data).digest('hex');
}

function hmac(key, data) {
  return createHmac('sha256', key).update(data).digest();
}

/**
 * Signs and sends one request to R2's S3 endpoint.
 *
 * Signed by hand on purpose: the alternative is an AWS SDK, and this needs two
 * verbs against one bucket. Only `host`, the payload hash and the date are
 * signed; the cache headers ride along unsigned, which keeps the signature
 * stable whatever we decide to send as a cache directive.
 */
async function r2Request(credentials, { method, key, body, contentType, cacheControl }) {
  if (!/^[A-Za-z0-9!_.*'()/-]+$/.test(key)) throw new Error(`Key needs escaping: ${key}`);

  const { host, bucket } = credentials;
  const path = `/${bucket}/${key}`;
  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256Hex(body ?? '');

  const signedHeaderValues = {
    host,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  const signedHeaderNames = Object.keys(signedHeaderValues).sort();
  const canonicalHeaders = signedHeaderNames
    .map((name) => `${name}:${signedHeaderValues[name]}\n`)
    .join('');
  const signedHeaders = signedHeaderNames.join(';');

  const canonicalRequest = [method, path, '', canonicalHeaders, signedHeaders, payloadHash].join(
    '\n'
  );

  const scope = `${dateStamp}/auto/s3/aws4_request`;
  const stringToSign = ['AWS4-HMAC-SHA256', amzDate, scope, sha256Hex(canonicalRequest)].join('\n');

  const signingKey = ['auto', 's3', 'aws4_request'].reduce(
    (key, part) => hmac(key, part),
    hmac(`AWS4${credentials.secretAccessKey}`, dateStamp)
  );
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex');

  const headers = {
    authorization:
      `AWS4-HMAC-SHA256 Credential=${credentials.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
    'x-amz-content-sha256': payloadHash,
    'x-amz-date': amzDate,
  };
  if (contentType) headers['content-type'] = contentType;
  if (cacheControl) headers['cache-control'] = cacheControl;

  // The URL actually fetched, not the path that was signed: when those two
  // disagree, the message is the only place the disagreement can be seen.
  const url = `${credentials.endpoint}${path}`;
  let response;
  try {
    response = await fetch(url, { method, headers, body });
  } catch (error) {
    // A TLS or DNS failure here is the network, not the code: say what the
    // socket said rather than "fetch failed". The origin is deliberately not
    // echoed — it comes from the environment, and env values do not get logged.
    const cause = error.cause
      ? `${error.cause.code ?? ''} ${error.cause.message ?? ''}`.trim()
      : '';
    throw new Error(`${method} ${key} failed: ${error.message}${cause ? ` (${cause})` : ''}`);
  }
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new Error(`${method} ${key} -> ${response.status} ${detail.slice(0, 300)}`);
  }
  return response;
}

/** True when the object is already in the bucket. */
async function objectExists(credentials, key) {
  try {
    await r2Request(credentials, { method: 'HEAD', key });
    return true;
  } catch (error) {
    if (String(error.message).includes('-> 404')) return false;
    throw error;
  }
}

// --- Manifests --------------------------------------------------------------

/** Reads every Surah manifest already on disk, so a partial run stays honest. */
function readExistingManifests(edition) {
  const dir = join(AUDIO_DIR, edition);
  const manifests = new Map();
  let entries;
  try {
    entries = readdirSync(dir);
  } catch (error) {
    // Nothing vendored for this edition yet.
    if (error.code === 'ENOENT') return manifests;
    throw error;
  }
  for (const entry of entries) {
    if (!/^\d{3}\.json$/.test(entry)) continue;
    manifests.set(Number(entry.slice(0, 3)), JSON.parse(readFileSync(join(dir, entry), 'utf8')));
  }
  return manifests;
}

async function writeIndex(edition, options, manifests) {
  const ayat = [...manifests.values()].reduce((total, m) => total + m.files.length, 0);
  const bytes = [...manifests.values()].reduce((total, m) => total + m.bytes, 0);
  const suras = manifests.size;
  const index = {
    source: 'AlQuran Cloud / Islamic Network (https://alquran.cloud)',
    license: SOURCE_LICENSE,
    attribution: ATTRIBUTION,
    // `complete` is what stops a partial set being mistaken for the whole Quran:
    // a reader offers a Surah only when its manifest is here.
    editions: [
      {
        id: edition,
        reciter: options.reciter,
        reciterLatin: options.reciterLatin,
        style: options.style,
        bitrateKbps: options.bitrate,
        container: 'mp3',
        baseUrl: 'https://audio.royaraqamia.com',
        sourceUrl: `${CDN}/quran/audio/${options.bitrate}/${edition}/{ayah}.mp3`,
        attribution: ATTRIBUTION,
        license: SOURCE_LICENSE,
        suras,
        ayat,
        bytes,
        complete: suras === 114,
      },
    ],
  };
  await writeFile(join(AUDIO_DIR, edition, 'index.json'), `${JSON.stringify(index, null, 2)}\n`);
  return index;
}

// --- Main -------------------------------------------------------------------

async function vendorSurah(surah, options, credentials) {
  const surahKey = String(surah.n).padStart(3, '0');
  const manifestPath = join(AUDIO_DIR, options.edition, `${surahKey}.json`);
  let existing = null;
  try {
    existing = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    // No manifest for this Surah yet: nothing to compare against.
    if (error.code !== 'ENOENT') throw error;
  }
  const known = new Map((existing?.files ?? []).map((file) => [file.ayah, file]));

  const numbers = Array.from({ length: surah.ayahCount }, (_, index) => index + 1);
  const files = await mapLimit(numbers, options.concurrency, async (ayah) => {
    const globalAyah = surah.offset + ayah;
    if (!Number.isInteger(globalAyah) || globalAyah < 1 || globalAyah > AYAH_COUNT) {
      throw new Error(`Surah ${surah.n} Ayah ${ayah} falls outside the ${AYAH_COUNT}`);
    }
    const url = `${CDN}/quran/audio/${options.bitrate}/${options.edition}/${globalAyah}.mp3`;
    const bytes = await fetchAyah(url, options.attempts);

    const frame = readFrameHeader(bytes);
    if (!frame) throw new Error(`${url}: no MPEG frame header — not an MP3`);

    const key = `${options.edition}/${surahKey}/${String(ayah).padStart(3, '0')}.mp3`;
    const sha256 = sha256Hex(bytes);
    const previous = known.get(ayah);
    const unchanged = previous && previous.sha256 === sha256 && previous.bytes === bytes.length;

    if (!options.dryRun) {
      // Re-upload when the source changed, when asked, or when the object is
      // missing — so a deleted object heals on the next run instead of leaving a
      // manifest pointing at nothing.
      const needsUpload = options.force || !unchanged || !(await objectExists(credentials, key));
      if (needsUpload) {
        await r2Request(credentials, {
          method: 'PUT',
          key,
          body: bytes,
          contentType: CONTENT_TYPE,
          cacheControl: CACHE_CONTROL,
        });
      }
    }
    return { ayah, key, bytes: bytes.length, sha256, skipped: Boolean(unchanged), frame };
  });

  // One codec for the whole set, or the reader hears the seams (ADR-0062).
  const descriptions = new Set(files.map((file) => describeFrame(file.frame)));
  if (descriptions.size > 1) {
    throw new Error(`Surah ${surah.n} is not a uniform set: ${[...descriptions].join(' | ')}`);
  }

  const manifest = {
    edition: options.edition,
    surah: surah.n,
    name: surah.name,
    ayahCount: surah.ayahCount,
    bytes: files.reduce((total, file) => total + file.bytes, 0),
    files: files.map(({ ayah, key, bytes: size, sha256 }) => ({ ayah, key, bytes: size, sha256 })),
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const uploaded = files.filter((file) => !file.skipped).length;
  console.log(
    `  surah ${surahKey} ${surah.name}: ${files.length} ayat, ` +
      `${(manifest.bytes / 1048576).toFixed(2)} MiB, ${uploaded} ` +
      `${options.dryRun ? 'to upload' : 'uploaded'} (${[...descriptions][0]})`
  );
  return manifest;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(
      [
        'Usage: node scripts/vendor-quran-audio.mjs [options]',
        '',
        '  --surah 1,114         Surahs to vendor (default: all 114)',
        '  --edition ar.alafasy  Reciter id on the CDN',
        '  --bitrate 64          Bitrate to fetch, as published',
        '  --concurrency 6       Parallel fetches',
        '  --dry-run             Fetch and verify, write manifests, upload nothing',
        '  --force               Re-upload even when unchanged',
      ].join('\n')
    );
    return;
  }

  if (!EDITION_PATTERN.test(options.edition)) {
    throw new Error(`--edition must look like ar.alafasy, not ${options.edition}`);
  }
  if (!PUBLISHED_BITRATES.has(options.bitrate)) {
    throw new Error(`--bitrate must be one of ${[...PUBLISHED_BITRATES].join(', ')}`);
  }

  loadEnvFile(ENV_FILE);
  const credentials = options.dryRun ? null : requireCredentials();

  const index = JSON.parse(readFileSync(TEXT_INDEX, 'utf8'));
  let offset = 0;
  const suras = index.surahs.map((surah) => {
    if (
      !Number.isInteger(surah.n) ||
      surah.n < 1 ||
      surah.n > 114 ||
      !Number.isInteger(surah.ayahCount) ||
      surah.ayahCount < 1
    ) {
      throw new Error(`The text index has an unusable Surah entry: ${JSON.stringify(surah.n)}`);
    }
    const withOffset = { ...surah, offset };
    offset += surah.ayahCount;
    return withOffset;
  });
  if (offset !== AYAH_COUNT) {
    throw new Error(`The text index covers ${offset} Ayat, not ${AYAH_COUNT}`);
  }

  const scope = options.suras ? suras.filter((surah) => options.suras.includes(surah.n)) : suras;
  if (scope.length === 0) throw new Error('No Surah matched --surah');

  await mkdir(join(AUDIO_DIR, options.edition), { recursive: true });

  console.log(
    `Vendoring ${options.edition} at ${options.bitrate} kbps from ${CDN}` +
      `${options.dryRun ? ' (dry run, nothing is uploaded)' : ''}`
  );
  console.log(`  ${scope.length} Surah(s), ${scope.reduce((n, s) => n + s.ayahCount, 0)} Ayat`);

  const startedAt = Date.now();
  for (const surah of scope) await vendorSurah(surah, options, credentials);

  const written = await writeIndex(
    options.edition,
    options,
    readExistingManifests(options.edition)
  );
  const edition = written.editions[0];
  console.log(
    `\n${edition.id}: ${edition.suras}/114 Suras, ${edition.ayat}/6236 Ayat, ` +
      `${(edition.bytes / 1048576).toFixed(2)} MiB, complete: ${edition.complete}`
  );
  console.log(
    `  manifests: public/quran/audio/${edition.id}/ · ${((Date.now() - startedAt) / 1000).toFixed(
      1
    )}s`
  );
  if (edition.complete) {
    const gib = edition.bytes / 1024 ** 3;
    console.log(`  whole Quran at ${options.bitrate} kbps = ${gib.toFixed(2)} GiB`);
  }
}

main().catch((error) => {
  console.error(`\nvendor-quran-audio failed: ${error.message}`);
  process.exitCode = 1;
});
