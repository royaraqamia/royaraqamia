/**
 * The single config-driven Platform allowlist (ADR-0020). Platform breadth is
 * maximal — every Platform we can extract is listed and enabled by default — and
 * the restriction is on content, not Platform. An Admin can disable an entry at
 * runtime; a Platform's repeated extraction failures open its circuit breaker.
 *
 * A URL whose host matches no entry is a generic, best-effort target: it is still
 * attempted, it just has no toggle or breaker. Add a Platform here (with its
 * domains) to give it one.
 */

export interface DownloadPlatform {
  /** Stable id stored on a job's `platform` and in `downloader_platforms`. */
  id: string;
  /** Human label for the Admin Console. */
  name: string;
  /** Hostnames that belong to the Platform; a subdomain of any of these matches. */
  domains: readonly string[];
  /** Whether the Platform starts enabled; an Admin can override at runtime. */
  enabledByDefault: boolean;
}

export const DOWNLOAD_PLATFORMS: readonly DownloadPlatform[] = [
  { id: 'youtube', name: 'YouTube', domains: ['youtube.com', 'youtu.be'], enabledByDefault: true },
  { id: 'tiktok', name: 'TikTok', domains: ['tiktok.com'], enabledByDefault: true },
  { id: 'instagram', name: 'Instagram', domains: ['instagram.com'], enabledByDefault: true },
  {
    id: 'facebook',
    name: 'Facebook',
    domains: ['facebook.com', 'fb.watch'],
    enabledByDefault: true,
  },
  { id: 'twitter', name: 'X (Twitter)', domains: ['twitter.com', 'x.com'], enabledByDefault: true },
  { id: 'vimeo', name: 'Vimeo', domains: ['vimeo.com'], enabledByDefault: true },
  {
    id: 'dailymotion',
    name: 'Dailymotion',
    domains: ['dailymotion.com', 'dai.ly'],
    enabledByDefault: true,
  },
  { id: 'reddit', name: 'Reddit', domains: ['reddit.com', 'redd.it'], enabledByDefault: true },
  { id: 'soundcloud', name: 'SoundCloud', domains: ['soundcloud.com'], enabledByDefault: true },
  { id: 'twitch', name: 'Twitch', domains: ['twitch.tv'], enabledByDefault: true },
  { id: 'bandcamp', name: 'Bandcamp', domains: ['bandcamp.com'], enabledByDefault: true },
  { id: 'bilibili', name: 'Bilibili', domains: ['bilibili.com', 'b23.tv'], enabledByDefault: true },
  {
    id: 'pinterest',
    name: 'Pinterest',
    domains: ['pinterest.com', 'pin.it'],
    enabledByDefault: true,
  },
  { id: 'snapchat', name: 'Snapchat', domains: ['snapchat.com'], enabledByDefault: true },
  { id: 'linkedin', name: 'LinkedIn', domains: ['linkedin.com'], enabledByDefault: true },
  { id: 'tumblr', name: 'Tumblr', domains: ['tumblr.com'], enabledByDefault: true },
  { id: 'rumble', name: 'Rumble', domains: ['rumble.com'], enabledByDefault: true },
  { id: 'odysee', name: 'Odysee', domains: ['odysee.com'], enabledByDefault: true },
  { id: 'vk', name: 'VK', domains: ['vk.com'], enabledByDefault: true },
  { id: 'okru', name: 'Odnoklassniki', domains: ['ok.ru'], enabledByDefault: true },
  {
    id: 'niconico',
    name: 'Niconico',
    domains: ['nicovideo.jp', 'nico.ms'],
    enabledByDefault: true,
  },
  { id: 'streamable', name: 'Streamable', domains: ['streamable.com'], enabledByDefault: true },
  { id: 'imgur', name: 'Imgur', domains: ['imgur.com'], enabledByDefault: true },
  { id: 'archive', name: 'Internet Archive', domains: ['archive.org'], enabledByDefault: true },
  { id: 'mixcloud', name: 'Mixcloud', domains: ['mixcloud.com'], enabledByDefault: true },
  { id: 'audiomack', name: 'Audiomack', domains: ['audiomack.com'], enabledByDefault: true },
  { id: 'deezer', name: 'Deezer', domains: ['deezer.com'], enabledByDefault: true },
  { id: 'kick', name: 'Kick', domains: ['kick.com'], enabledByDefault: true },
];

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** The Platform a URL targets, or `null` for a generic best-effort host. */
export function platformForUrl(url: string): DownloadPlatform | null {
  const host = hostnameOf(url);
  if (!host) return null;

  for (const platform of DOWNLOAD_PLATFORMS) {
    for (const domain of platform.domains) {
      if (host === domain || host.endsWith(`.${domain}`)) return platform;
    }
  }
  return null;
}

export function platformIdForUrl(url: string): string | null {
  return platformForUrl(url)?.id ?? null;
}

export function findPlatform(id: string): DownloadPlatform | null {
  return DOWNLOAD_PLATFORMS.find((platform) => platform.id === id) ?? null;
}
