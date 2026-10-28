import { logger } from './logger';

/**
 * The Android shell's changelog, as the site serves it.
 *
 * `public/android/changelog.json` is written by the release cut
 * (`scripts/android-release.mjs`, ADR-0089): one entry per Android release, with
 * the Arabic notes the pull requests wrote. It lives beside the site rather than
 * behind the GitHub API on purpose — release assets are unreachable from at least
 * one country this app has users in (ADR-0047), and a changelog those users cannot
 * load is the same defect in a smaller place.
 *
 * The page that reads it is for people who already have the app: it is reached
 * from `/account`, and its row only renders inside the shell.
 */

export const ANDROID_CHANGELOG_PATH = '/android/changelog.json';

/** How many releases the page shows, even if the file ever carries more. */
export const CHANGELOG_PAGE_LIMIT = 20;

export interface AndroidRelease {
  version: string;
  versionCode: number;
  releasedAt: string;
  notes: string[];
}

const asText = (value: unknown): string => (typeof value === 'string' ? value.trim() : '');

/**
 * Reads the file defensively: anything unreadable is simply absent, because a
 * half-written or stale changelog must never take the page down. A release with
 * no version or no notes says nothing, so it is dropped rather than rendered as
 * an empty card.
 */
export function toAndroidReleases(value: unknown): AndroidRelease[] {
  const releases = (value as { releases?: unknown } | null)?.releases;
  if (!Array.isArray(releases)) return [];

  return releases
    .map((entry) => {
      const record = (entry ?? {}) as Record<string, unknown>;
      const notes = Array.isArray(record.notes)
        ? record.notes.map(asText).filter((note) => note.length > 0)
        : [];
      return {
        version: asText(record.version),
        versionCode: Number.isInteger(record.versionCode) ? (record.versionCode as number) : 0,
        releasedAt: asText(record.releasedAt),
        notes,
      };
    })
    .filter((release) => release.version.length > 0 && release.notes.length > 0)
    .slice(0, CHANGELOG_PAGE_LIMIT);
}

/** The changelog, or an empty list when it cannot be read. */
export async function fetchAndroidChangelog({
  fetchImpl = fetch,
  path = ANDROID_CHANGELOG_PATH,
}: {
  fetchImpl?: typeof fetch;
  path?: string;
} = {}): Promise<AndroidRelease[]> {
  try {
    const response = await fetchImpl(path, { cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return toAndroidReleases(await response.json());
  } catch (error) {
    logger.warn('Android changelog unreadable', { error: String(error) });
    return [];
  }
}
