import { describe, expect, it } from 'vitest';

import { loadAthkar } from '@/backend/loaders/athkar';
import { ATHKAR_PERIODS, type AthkarCollection } from '@/shared/contracts/athkar';

/**
 * The vendored Athkar, held to the contract it ships under.
 *
 * `loadAthkar` validates the file it reads, so a malformed entry already fails
 * the build. What is checked here is what the schema cannot see: that both
 * sittings exist, that the entries they share say exactly the same words, and
 * that nothing in either file smuggles in a digit shape or a non-NFC spelling
 * the rest of the site forbids.
 */

const ARABIC_INDIC_DIGITS = /[\u0660-\u0669\u06f0-\u06f9]/;

async function both(): Promise<Record<string, AthkarCollection>> {
  const loaded = await Promise.all(ATHKAR_PERIODS.map((period) => loadAthkar(period)));
  return Object.fromEntries(loaded.map((collection) => [collection.period, collection]));
}

describe('athkar content', () => {
  it('loads both collections under their own period', async () => {
    const collections = await both();

    for (const period of ATHKAR_PERIODS) {
      const collection = collections[period];
      expect(collection, `${period} did not load`).toBeDefined();
      expect(collection?.period).toBe(period);
      expect(collection?.title.length).toBeGreaterThan(0);
      expect(collection?.items.length).toBeGreaterThan(10);
    }
  });

  it('gives every dhikr a source and a repeat inside the contract', async () => {
    const collections = await both();

    for (const collection of Object.values(collections)) {
      for (const item of collection?.items ?? []) {
        expect(item.id, 'id must be a stable slug').toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
        expect(item.repeat).toBeGreaterThanOrEqual(1);
        expect(item.repeat).toBeLessThanOrEqual(1000);
        expect(item.source.label.length).toBeGreaterThan(0);
        expect(item.source.ref.length).toBeGreaterThan(0);
        expect(item.text.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it('keeps the entries both sittings share word-for-word', async () => {
    const collections = await both();
    const morning = collections.morning;
    const evening = collections.evening;

    // The dhikr said with the same words at both times. The entries whose verb
    // changes (`fitrat-al-islam`, `ashhuduka`) are deliberately not here: they
    // share an id so a reader's count is keyed consistently, not because they
    // read the same.
    const identical = [
      'ayat-al-kursi',
      'muawwidhat',
      'sayyid-al-istighfar',
      'subhanallah-wa-bihamdih',
      'afini-fi-badani',
      'hasbiyallah',
      'bismillah-alladhi',
      'raditu-billah',
      'afw-wa-afiyah',
      'ya-hayyu-ya-qayyum',
    ];

    for (const id of identical) {
      const inMorning = morning?.items.find((item) => item.id === id);
      const inEvening = evening?.items.find((item) => item.id === id);

      expect(inMorning, `${id} is missing from the morning`).toBeDefined();
      expect(inEvening, `${id} is missing from the evening`).toBeDefined();
      expect(inEvening?.text, `${id} drifts between the two sittings`).toBe(inMorning?.text);
      expect(inEvening?.repeat, `${id} repeats differently`).toBe(inMorning?.repeat);
    }
  });

  it('writes ASCII digits and precomposed Arabic only', async () => {
    const collections = await both();

    for (const collection of Object.values(collections)) {
      const strings = [
        collection?.title ?? '',
        ...(collection?.items ?? []).flatMap((item) => [
          item.text,
          item.virtue ?? '',
          item.source.label,
          item.source.ref,
        ]),
      ];

      for (const value of strings) {
        expect(value).not.toMatch(ARABIC_INDIC_DIGITS);
        expect(value.normalize('NFC'), `not NFC: ${value.slice(0, 24)}`).toBe(value);
      }
    }
  });
});
