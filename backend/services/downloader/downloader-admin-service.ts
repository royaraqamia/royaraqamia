import {
  DEFAULT_DOWNLOAD_SETTINGS,
  type DownloadBlockKind,
  type DownloadBlocklistEntry,
  type DownloadJobPage,
  type DownloadPlatformView,
  type DownloadSettings,
} from '@/shared/contracts/downloader';
import type {
  DownloadJobListQuery,
  DownloadJobRepository,
} from '@/backend/repositories/downloader/download-job-repository';
import type {
  DownloadPlatformRepository,
  DownloadPlatformState,
} from '@/backend/repositories/downloader/download-platform-repository';
import type { DownloadBlocklistRepository } from '@/backend/repositories/downloader/download-blocklist-repository';
import type { DownloadSettingsRepository } from '@/backend/repositories/downloader/download-settings-repository';
import {
  DOWNLOAD_PLATFORMS,
  findPlatform,
  type DownloadPlatform,
} from '@/backend/services/downloader/platform-catalog';

export interface DownloaderAdminServiceDeps {
  now?: () => Date;
}

/**
 * The Admin Console's view of the Media Downloader: the recent Download Jobs, the
 * domain/URL blocklist, the Platform allowlist toggles and the tunable caps. It
 * owns no policy of its own — it reads and writes the same repositories the
 * Downloader Service enforces, so an Admin change takes effect on the next
 * request without a deploy.
 */
export class DownloaderAdminService {
  private readonly now: () => Date;

  constructor(
    private readonly jobs: DownloadJobRepository,
    private readonly blocklist: DownloadBlocklistRepository,
    private readonly platforms: DownloadPlatformRepository,
    private readonly settings: DownloadSettingsRepository,
    deps: DownloaderAdminServiceDeps = {}
  ) {
    this.now = deps.now ?? (() => new Date());
  }

  async listJobs(query: DownloadJobListQuery): Promise<DownloadJobPage> {
    const { jobs, total } = await this.jobs.list(query);
    return { jobs, total, page: query.page, pageSize: query.pageSize };
  }

  listBlocklist(): Promise<DownloadBlocklistEntry[]> {
    return this.blocklist.list();
  }

  addBlock(input: {
    kind: DownloadBlockKind;
    value: string;
    createdBy: string | null;
  }): Promise<DownloadBlocklistEntry> {
    return this.blocklist.add(input);
  }

  removeBlock(id: string): Promise<void> {
    return this.blocklist.remove(id);
  }

  async listPlatforms(): Promise<DownloadPlatformView[]> {
    const states = await Promise.all(
      DOWNLOAD_PLATFORMS.map((platform) => this.platforms.get(platform.id))
    );
    return DOWNLOAD_PLATFORMS.map((platform, index) =>
      this.toView(platform, states[index] ?? null)
    );
  }

  /** Flip one Platform's enabled flag; `null` when the id is not in the catalogue. */
  async setPlatformEnabled(id: string, enabled: boolean): Promise<DownloadPlatformView | null> {
    const platform = findPlatform(id);
    if (!platform) return null;

    await this.platforms.save(id, { enabled });
    return this.toView(platform, await this.platforms.get(id));
  }

  async getSettings(): Promise<DownloadSettings> {
    return (await this.settings.get()) ?? DEFAULT_DOWNLOAD_SETTINGS;
  }

  async updateSettings(patch: Partial<DownloadSettings>): Promise<DownloadSettings> {
    const next = { ...(await this.getSettings()), ...patch };
    await this.settings.save(next);
    return next;
  }

  private toView(
    platform: DownloadPlatform,
    state: DownloadPlatformState | null
  ): DownloadPlatformView {
    const openUntil = state?.openUntil ?? null;
    return {
      id: platform.id,
      name: platform.name,
      domains: [...platform.domains],
      enabled: state?.enabled ?? platform.enabledByDefault,
      enabledByDefault: platform.enabledByDefault,
      consecutiveFailures: state?.consecutiveFailures ?? 0,
      openUntil,
      breakerOpen: Boolean(openUntil && new Date(openUntil) > this.now()),
    };
  }
}
