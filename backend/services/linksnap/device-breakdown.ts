import type { AnalyticsEvent } from '@/shared/contracts/linksnap';
import { parseUserAgent, type DeviceType } from '@/backend/services/linksnap/user-agent-parser';

export interface DeviceStat {
  name: string;
  count: number;
  percent: number;
}

export interface LinkDeviceBreakdown {
  devices: DeviceStat[];
  os: DeviceStat[];
  browsers: DeviceStat[];
}

function toStats(entries: Array<[string, number]>, total: number): DeviceStat[] {
  return entries
    .map(([name, count]) => ({
      name,
      count,
      percent: total > 0 ? Math.round((count / total) * 100) : 0,
    }))
    .sort((a, b) => b.count - a.count);
}

const DEVICE_LABEL: Record<DeviceType, string> = {
  mobile: 'جوال',
  tablet: 'لوحي',
  desktop: 'كمبيوتر',
  other: 'أخرى',
};

/**
 * Aggregates raw analytics events into per-device / OS / browser buckets with
 * click counts and percentages. Rows without a usable User-Agent group into
 * an 'Unknown' bucket per dimension.
 */
export function aggregateDeviceBreakdown(events: AnalyticsEvent[]): LinkDeviceBreakdown {
  const total = events.length;

  const deviceMap = new Map<DeviceType, number>();
  const osMap = new Map<string, number>();
  const browserMap = new Map<string, number>();

  for (const event of events) {
    const info = parseUserAgent(event.userAgent);
    deviceMap.set(info.deviceType, (deviceMap.get(info.deviceType) ?? 0) + 1);
    osMap.set(info.os.name, (osMap.get(info.os.name) ?? 0) + 1);
    browserMap.set(info.browser.name, (browserMap.get(info.browser.name) ?? 0) + 1);
  }

  return {
    devices: toStats(
      Array.from(deviceMap.entries()).map(([key, count]) => [DEVICE_LABEL[key], count]),
      total
    ),
    os: toStats(Array.from(osMap.entries()), total),
    browsers: toStats(Array.from(browserMap.entries()), total),
  };
}
