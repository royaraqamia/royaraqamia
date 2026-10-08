import type { DownloadBlockKind, DownloadBlocklistEntry } from '@/shared/contracts/downloader';

export interface AddDownloadBlockCommand {
  kind: DownloadBlockKind;
  value: string;
  createdBy: string | null;
}

/**
 * The only code that knows the `downloader_blocklist` table. Entries are read
 * whole (the list is small) so the create path can refuse a blocked link with a
 * pure, testable match rather than a database query per request.
 */
export interface DownloadBlocklistRepository {
  list(): Promise<DownloadBlocklistEntry[]>;
  add(input: AddDownloadBlockCommand): Promise<DownloadBlocklistEntry>;
  remove(id: string): Promise<void>;
}
