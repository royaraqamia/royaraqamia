import { describe, expect, it } from 'vitest';

import { trustedManifestEntries } from '../vendor-quran-audio.mjs';

/**
 * The resume rule behind `--trust-manifests` (ADR-0062).
 *
 * A manifest is what lets a resumed run skip the source, so the failures worth
 * catching are the ones that would let it skip work that was never done: a short
 * manifest from a Surah the run died inside, one belonging to another edition or
 * Surah, or an entry whose hash could not be what a reader is served. Each of
 * those has to fall back to fetching, because the alternative is a manifest that
 * promises files nobody has.
 *
 * The other half of the rule — a `HEAD` per file, so an object that is gone is
 * fetched again — needs the bucket and is not testable here.
 */

const SURAH = { n: 2, name: 'Al-Baqarah', ayahCount: 3 };
const EDITION = 'ar.alafasy';

/** A manifest for SURAH holding `count` usable entries. */
function manifest(count, overrides = {}) {
  return {
    edition: EDITION,
    surah: SURAH.n,
    name: SURAH.name,
    ayahCount: SURAH.ayahCount,
    bytes: count * 1000,
    files: Array.from({ length: count }, (_, index) => ({
      ayah: index + 1,
      key: `${EDITION}/002/${String(index + 1).padStart(3, '0')}.mp3`,
      bytes: 1000,
      sha256: 'a'.repeat(64),
    })),
    ...overrides,
  };
}

const trust = (existing, overrides = {}) =>
  trustedManifestEntries({
    existing,
    surah: SURAH,
    edition: EDITION,
    trust: true,
    force: false,
    dryRun: false,
    ...overrides,
  });

describe('trustedManifestEntries', () => {
  it('hands back every Ayah of a complete manifest for this Surah', () => {
    const entries = trust(manifest(3));

    expect([...entries.keys()]).toEqual([1, 2, 3]);
    expect(entries.get(2).sha256).toBe('a'.repeat(64));
  });

  it('refuses unless the run asked to trust, and never against an explicit choice', () => {
    expect(trust(manifest(3), { trust: false })).toBeNull();
    expect(trust(manifest(3), { force: true })).toBeNull();
    expect(trust(manifest(3), { dryRun: true })).toBeNull();
    expect(trust(null)).toBeNull();
  });

  it('refuses a manifest that is not this Surah, this edition, or this length', () => {
    expect(trust(manifest(3, { surah: 3 }))).toBeNull();
    expect(trust(manifest(3, { edition: 'ar.husary' }))).toBeNull();
    expect(trust(manifest(3, { ayahCount: 286 }))).toBeNull();
    expect(trust(manifest(3, { files: 'not a list' }))).toBeNull();
  });

  it('refuses one that is an Ayah short, or has a gap where an Ayah should be', () => {
    // What the Surah a run died inside leaves on disk.
    expect(trust(manifest(2))).toBeNull();

    const gapped = manifest(3);
    gapped.files[1] = { ...gapped.files[1], ayah: 9 };
    expect(trust(gapped)).toBeNull();
  });

  it('refuses an entry a reader could not be served, rather than trusting it', () => {
    const unhashed = manifest(3);
    unhashed.files[0] = { ...unhashed.files[0], sha256: 'not-a-hash' };
    expect(trust(unhashed)).toBeNull();

    const sizeless = manifest(3);
    sizeless.files[2] = { ...sizeless.files[2], bytes: 0 };
    expect(trust(sizeless)).toBeNull();

    const keyless = manifest(3);
    keyless.files[1] = { ...keyless.files[1], key: '' };
    expect(trust(keyless)).toBeNull();
  });
});
