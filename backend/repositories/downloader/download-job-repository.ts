import type {
  DownloadFormat,
  DownloadJob,
  DownloadJobFile,
  DownloadStatus,
} from '@/shared/contracts/downloader';

export interface CreateDownloadJobCommand {
  url: string;
  format: DownloadFormat;
}

/**
 * The mutable half of a Download Job; every call also records an event.
 * `file: null` clears a stored link (the `expired` transition), while leaving it
 * out leaves the existing fields untouched.
 */
export interface DownloadJobUpdate {
  status: DownloadStatus;
  platform?: string | null;
  error?: string | null;
  file?: DownloadJobFile | null;
}

/**
 * The only code that knows the `download_jobs` tables. Every method that moves
 * a job records the transition in `download_job_events`, so the job's history
 * is written at the same seam that changes its status.
 */
export interface DownloadJobRepository {
  create(input: CreateDownloadJobCommand): Promise<DownloadJob>;
  findById(id: string): Promise<DownloadJob | null>;
  updateStatus(id: string, patch: DownloadJobUpdate): Promise<DownloadJob>;
  /** Jobs the Media Provider is working on right now; drives the concurrency cap. */
  countActive(): Promise<number>;
}
