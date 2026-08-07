import { describe, it, expect } from 'vitest';
import { aggregateDeviceBreakdown } from '@/backend/services/linksnap/device-breakdown';
import type { AnalyticsEvent } from '@/shared/contracts/linksnap';

function ev(ua: string | null, idx: number): AnalyticsEvent {
  return {
    id: `e-${idx}`,
    linkCode: 'abc',
    clickedAt: new Date('2026-08-07T10:00:00.000Z'),
    referrer: null,
    userAgent: ua,
    ipCountry: null,
  };
}

const CHROME_WIN =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const SAFARI_IOS =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1';
const ANDROID_CHROME =
  'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36';

describe('aggregateDeviceBreakdown', () => {
  it('returns empty buckets for no events', () => {
    expect(aggregateDeviceBreakdown([])).toEqual({ devices: [], os: [], browsers: [] });
  });

  it('groups by device, OS and browser with counts and percentages', () => {
    const breakdown = aggregateDeviceBreakdown([
      ev(CHROME_WIN, 1),
      ev(CHROME_WIN, 2),
      ev(SAFARI_IOS, 3),
      ev(ANDROID_CHROME, 4),
      ev(null, 5),
    ]);

    const deviceNames = breakdown.devices.map((d) => d.name);
    expect(deviceNames).toContain('كمبيوتر');
    expect(deviceNames).toContain('جوال');
    expect(deviceNames).toContain('أخرى');
    expect(breakdown.devices.find((d) => d.name === 'كمبيوتر')?.count).toBe(2);
    expect(breakdown.devices.find((d) => d.name === 'جوال')?.count).toBe(2);

    expect(breakdown.os.find((o) => o.name === 'Windows')?.count).toBe(2);
    expect(breakdown.os.find((o) => o.name === 'iOS')?.count).toBe(1);
    expect(breakdown.os.find((o) => o.name === 'Android')?.count).toBe(1);
    expect(breakdown.os.find((o) => o.name === 'Unknown')?.count).toBe(1);

    expect(breakdown.browsers.find((b) => b.name === 'Chrome')?.count).toBe(3);
    expect(breakdown.browsers.find((b) => b.name === 'Safari')?.count).toBe(1);
    expect(breakdown.browsers.find((b) => b.name === 'Unknown')?.count).toBe(1);

    expect(breakdown.devices.reduce((s, d) => s + d.percent, 0)).toBeGreaterThan(0);
    const topDevice = breakdown.devices[0];
    expect(topDevice?.percent).toBe(40);
  });
});
