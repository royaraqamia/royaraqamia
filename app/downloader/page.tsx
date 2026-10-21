import { DownloaderPage } from '@/frontend/ui/downloader/downloader-page';

/**
 * A data-free shell since #450: the page holds no session read, no loader and no
 * `searchParams`, so the build prerenders it and the worker may precache it
 * (ADR-0071). Every fact on it comes from the client — the link probe and the job
 * are reads and writes of the never-cache `/api/downloader` prefix, and the
 * form's own submission is what needs a connection (ADR-0031).
 */
export default function DownloaderRoute() {
  return <DownloaderPage />;
}
