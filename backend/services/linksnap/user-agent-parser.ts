export type DeviceType = 'mobile' | 'tablet' | 'desktop' | 'other';

export interface UserAgentInfo {
  deviceType: DeviceType;
  os: { name: string; version: string | null };
  browser: { name: string; version: string | null };
}

const UNKNOWN: UserAgentInfo = {
  deviceType: 'other',
  os: { name: 'Unknown', version: null },
  browser: { name: 'Unknown', version: null },
};

function detectDeviceType(ua: string): DeviceType {
  if (/Mobile|iP(hone|od)/i.test(ua) || (/Android/i.test(ua) && /Mobile/i.test(ua))) {
    return 'mobile';
  }
  if (/iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua))) {
    return 'tablet';
  }
  return 'desktop';
}

function detectOs(ua: string): UserAgentInfo['os'] {
  if (/Windows/i.test(ua)) {
    const versionMatch = ua.match(/Windows NT (\d+\.\d+|[\d.]+)/i);
    const version = versionMatch?.[1] ?? null;
    const labels: Record<string, string> = {
      '10.0': '10',
      '6.3': '8.1',
      '6.2': '8',
      '6.1': '7',
      '6.0': 'Vista',
      '5.1': 'XP',
    };
    return { name: 'Windows', version: version ? (labels[version] ?? version) : null };
  }
  if (/CrOS|Chromium OS|Chrome OS/i.test(ua)) return { name: 'ChromeOS', version: null };
  if (/Android/i.test(ua)) {
    const match = ua.match(/Android ([\d._]+)/i);
    return { name: 'Android', version: match?.[1] ?? null };
  }
  if (/iPhone/i.test(ua) || (/iOS/i.test(ua) && !/Mac OS/i.test(ua))) {
    const match = ua.match(/iPhone OS ([\d_]+)/i);
    return { name: 'iOS', version: match?.[1]?.replace(/_/g, '.') ?? null };
  }
  if (/iPad/i.test(ua)) {
    const match = ua.match(/OS ([\d_]+)/i);
    return { name: 'iOS', version: match?.[1]?.replace(/_/g, '.') ?? null };
  }
  if (/Mac OS X/i.test(ua)) {
    const match = ua.match(/Mac OS X ([\d._]+)/i);
    return { name: 'macOS', version: match?.[1]?.replace(/_/g, '.') ?? null };
  }
  if (/linux/i.test(ua)) return { name: 'Linux', version: null };
  return { name: 'Unknown', version: null };
}

function detectBrowser(ua: string): UserAgentInfo['browser'] {
  // Order matters: Edge/OPR/SamsungBrowser must precede generic Chrome; Safari last.
  const candidates: Array<{ re: RegExp; name: string }> = [
    { re: /Edg\/([\d.]+)/i, name: 'Edge' },
    { re: /OPR\/([\d.]+)|Opera\//i, name: 'Opera' },
    { re: /SamsungBrowser\/([\d.]+)/i, name: 'Samsung Internet' },
    { re: /Firefox\/([\d.]+)/i, name: 'Firefox' },
    { re: /Chrome\/([\d.]+)/i, name: 'Chrome' },
    { re: /Version\/([\d.]+).*Safari|Safari\//i, name: 'Safari' },
    { re: /MSIE|Trident/i, name: 'IE' },
    { re: /Brave/i, name: 'Brave' },
  ];

  for (const { re, name } of candidates) {
    const match = ua.match(re);
    if (match) {
      return { name, version: match[1] ?? null };
    }
  }
  return { name: 'Unknown', version: null };
}

/**
 * Parses a raw User-Agent header into device/OS/browser buckets.
 * Dependency-free and deterministic; unknown values fall back to 'Unknown'.
 */
export function parseUserAgent(ua: string | null | undefined): UserAgentInfo {
  if (!ua) return UNKNOWN;
  try {
    return {
      deviceType: detectDeviceType(ua),
      os: detectOs(ua),
      browser: detectBrowser(ua),
    };
  } catch {
    return UNKNOWN;
  }
}
