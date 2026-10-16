import { normalizeHostname, type DownloadBlocklistEntry } from '@/shared/contracts/downloader';

/**
 * Whether a source URL is refused by the blocklist. A `domain` entry bans the
 * host and every subdomain of it; a `url` entry bans one exact link (compared
 * after trimming). A URL that cannot be parsed only matches an exact `url` entry.
 */
export function isUrlBlocked(url: string, entries: readonly DownloadBlocklistEntry[]): boolean {
  const trimmed = url.trim();
  if (entries.length === 0) return false;

  let host: string | null = null;
  try {
    host = normalizeHostname(new URL(trimmed).hostname);
  } catch {
    host = null;
  }

  return entries.some((entry) => {
    if (entry.kind === 'domain') {
      if (!host) return false;
      const domain = entry.value.toLowerCase();
      return host === domain || host.endsWith(`.${domain}`);
    }
    return trimmed === entry.value;
  });
}
