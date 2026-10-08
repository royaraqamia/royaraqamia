import type {
  CreateDownloadJobInput,
  DownloadJob,
  ProbeResult,
} from '@/shared/contracts/downloader';
import { request } from '@/frontend/transport/http';

interface DownloadJobResponse {
  success: true;
  job: DownloadJob;
}

interface InspectResponse {
  success: true;
  result: ProbeResult;
}

export async function createDownloadJob(input: CreateDownloadJobInput): Promise<DownloadJob> {
  const res = await request<DownloadJobResponse>('/api/downloader/jobs', {
    method: 'POST',
    body: JSON.stringify(input),
  });
  return res.job;
}

export async function getDownloadJob(id: string): Promise<DownloadJob> {
  const res = await request<DownloadJobResponse>(`/api/downloader/jobs/${encodeURIComponent(id)}`);
  return res.job;
}

export async function inspectDownloadLink(url: string): Promise<ProbeResult> {
  const res = await request<InspectResponse>('/api/downloader/inspect', {
    method: 'POST',
    body: JSON.stringify({ url }),
  });
  return res.result;
}
