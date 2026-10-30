import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { formatHijriDate } from '../format';

/**
 * The date the app must draw, pinned once (ADR-0098).
 *
 * The plan card reads "تنتهي الخطّة في {date}" on both clients. The site formats
 * with `Intl`; the app formats with Android's Umm al-Qura calendar and its own
 * locale data. Two platform formatters that agree today can disagree after either
 * is updated, and a user would see a card whose date is one day off. So the
 * expected strings live in one file that both suites read: this one, and
 * `android/app/src/test/kotlin/com/royaraqamia/app/plans/HijriDateTest.kt`.
 */
describe('formatHijriDate', () => {
  const fixture = JSON.parse(
    readFileSync(path.join(process.cwd(), 'shared/fixtures/parity/hijri-dates.json'), 'utf8')
  ) as { cases: { iso: string; label: string }[] };

  it('lists the cases both clients are held to', () => {
    expect(fixture.cases.length).toBeGreaterThan(0);
  });

  it.each(fixture.cases)('reads $iso the way the app must read it', ({ iso, label }) => {
    expect(formatHijriDate(iso)).toBe(label);
  });
});
