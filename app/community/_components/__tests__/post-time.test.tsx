import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';

import { formatRelativeTime } from '@/shared/relative-time';
import { PostTime, postTimeLabel } from '../post-time';

/**
 * The feed's age sentence, held to the page's (#1580).
 *
 * The copy is generated (`shared/copy/post-time.json`), so the app and the page
 * cannot spell one word differently by accident; what can still drift is the
 * ladder and the plural form the copy is chosen by. This test sweeps both
 * against `formatRelativeTime`, which is what the page renders today, so a copy
 * file that gets a form wrong - or a rounding that moves by a minute - is red
 * here rather than a card that reads one way in the browser and another in the
 * app.
 */
describe('postTimeLabel', () => {
  const now = Date.parse('2026-11-17T12:00:00.000Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('says exactly what the page says, minute by minute and year by year', () => {
    const offsets = new Set<number>();
    // Every minute for two days: both sides of every minute and hour boundary.
    for (let minute = 0; minute <= 2 * 24 * 60; minute += 1) offsets.add(minute * 60_000);
    // Every seven minutes for two months: the day and week boundaries.
    for (let minute = 0; minute <= 60 * 24 * 60; minute += 7) offsets.add(minute * 60_000);
    // Every day for four years, at an hour no boundary rounds away.
    for (let day = 0; day <= 1_500; day += 1) offsets.add(day * 86_400_000 + 12 * 3_600_000);
    // Every year for twelve centuries, which reaches the grouping and `other`.
    for (let year = 1; year <= 1_200; year += 1) offsets.add((year * 365 + 3) * 86_400_000);

    const disagreements = [...offsets]
      .map((offset) => ago(offset))
      .map((iso) => ({ iso, copy: postTimeLabel(iso, now), page: formatRelativeTime(iso, now) }))
      .filter(({ copy, page }) => copy !== page);

    expect(disagreements.slice(0, 5)).toEqual([]);
  });

  it('draws nothing for a string that is not an instant, as the page does', () => {
    expect(postTimeLabel(null, now)).toBeNull();
    expect(postTimeLabel('not a date', now)).toBeNull();
  });
});

describe('PostTime', () => {
  it('draws one time element wearing the caller’s class', () => {
    const iso = new Date(Date.now() - 4 * 7 * 86_400_000).toISOString();
    const { container } = render(<PostTime iso={iso} className="font-medium" />);
    const time = container.querySelector('time');

    expect(time).not.toBeNull();
    expect(time).toHaveAttribute('dateTime', iso);
    expect(time?.className).toBe('font-medium');
    expect(time?.textContent).toContain('4');
  });

  it('draws nothing at all for a timestamp the page cannot read', () => {
    const { container } = render(<PostTime iso="not a date" />);

    expect(container.querySelector('time')).toBeNull();
    expect(container.textContent).toBe('');
  });
});
