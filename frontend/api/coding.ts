import type {
  CodingAvailableRepoDto,
  CodingLocalGrantDto,
  CodingLocalPairDto,
  CodingStepDto,
  CodingTaskDto,
  CodingWorkspaceDto,
  CreateCodingTaskInput,
  CreateCodingWorkspaceInput,
  DecideCodingStepInput,
} from '@/shared/contracts/coding-agent';
import { request } from '@/frontend/transport/http';

/**
 * The coding surface's transport (ADR-0219).
 *
 * The routes are account-scoped, so every read is `no-store` and every call
 * carries the session cookie. Reads throw to the caller — an empty list and a
 * failed read must never look alike on a screen that spends a member's runner
 * minutes. `request` already throws on a non-2xx body or `success: false`.
 */
interface CodingOkResponse {
  success: boolean;
  error?: string;
}

/**
 * Usage is accumulated on the task and on its steps when the runner called the
 * model. Both are optional on the wire: a task that never spent tokens renders
 * no usage row.
 */
export type CodingStepWithUsage = CodingStepDto & {
  inputTokens?: number | null;
  outputTokens?: number | null;
};

export type CodingTaskWithUsage = Omit<CodingTaskDto, 'steps'> & {
  steps: CodingStepWithUsage[];
  inputTokens?: number | null;
  outputTokens?: number | null;
};

/** The client's own page shape: only the opaque cursor is optional. */
export interface CodingTaskListResult {
  tasks: CodingTaskWithUsage[];
  nextCursor: string | null;
}

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;
const READ = { cache: 'no-store', credentials: 'same-origin' } as const;

/**
 * The member routes answer their DTO directly today; an `{ success, data }`
 * envelope is accepted too so a controller that adopts one needs no UI change.
 */
function codingData<T>(body: unknown): T | null {
  if (body === null || body === undefined) return null;
  if (typeof body === 'object' && !Array.isArray(body) && 'data' in body) {
    const data = (body as { data: unknown }).data;
    return data === null || data === undefined ? null : (data as T);
  }
  return body as T;
}

/** A resolved write means the server accepted it; refusals arrived as a throw. */
async function write(url: string, options: RequestInit): Promise<CodingOkResponse> {
  await request<unknown>(url, { ...options, credentials: 'same-origin' });
  return { success: true };
}

export async function getCodingWorkspaces(): Promise<CodingWorkspaceDto[]> {
  const body = await request<unknown>('/api/coding/workspaces', READ);
  return codingData<CodingWorkspaceDto[]>(body) ?? [];
}

export async function getCodingAvailableRepos(): Promise<CodingAvailableRepoDto[]> {
  const body = await request<unknown>('/api/coding/repos', READ);
  return codingData<CodingAvailableRepoDto[]>(body) ?? [];
}

export async function createCodingWorkspace(
  input: CreateCodingWorkspaceInput
): Promise<CodingWorkspaceDto> {
  const body = await request<unknown>('/api/coding/workspaces', {
    method: 'POST',
    credentials: 'same-origin',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  const workspace = codingData<CodingWorkspaceDto>(body);
  if (!workspace) throw new Error('تعذّر ربط المستودع.');
  return workspace;
}

export function deleteCodingWorkspace(id: string): Promise<CodingOkResponse> {
  return write(`/api/coding/workspaces/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** A pairing code is shown once; the server keeps only its digest. */
export async function createCodingLocalPair(deviceLabel: string): Promise<CodingLocalPairDto> {
  const body = await request<unknown>('/api/coding/local/pairs', {
    method: 'POST',
    credentials: 'same-origin',
    headers: JSON_HEADERS,
    body: JSON.stringify({ deviceLabel }),
  });
  const pair = codingData<CodingLocalPairDto>(body);
  if (!pair?.code) throw new Error('تعذّر إنشاء رمز الربط.');
  return pair;
}

export async function getCodingLocalGrants(): Promise<CodingLocalGrantDto[]> {
  const body = await request<unknown>('/api/coding/local/grants', READ);
  return codingData<CodingLocalGrantDto[]>(body) ?? [];
}

export function revokeCodingLocalGrant(id: string): Promise<CodingOkResponse> {
  return write(`/api/coding/local/grants/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

export async function getCodingTasks(cursor: string | null = null): Promise<CodingTaskListResult> {
  const query = cursor ? `?cursor=${encodeURIComponent(cursor)}` : '';
  const body = await request<unknown>(`/api/coding/tasks${query}`, READ);
  const page = codingData<CodingTaskListResult>(body);
  return { tasks: page?.tasks ?? [], nextCursor: page?.nextCursor ?? null };
}

export async function createCodingTask(input: CreateCodingTaskInput): Promise<CodingTaskWithUsage> {
  const body = await request<unknown>('/api/coding/tasks', {
    method: 'POST',
    credentials: 'same-origin',
    headers: JSON_HEADERS,
    body: JSON.stringify(input),
  });
  const task = codingData<CodingTaskWithUsage>(body);
  if (!task) throw new Error('تعذّر إنشاء المهمة.');
  return task;
}

export async function getCodingTask(id: string): Promise<CodingTaskWithUsage> {
  const body = await request<unknown>(`/api/coding/tasks/${encodeURIComponent(id)}`, READ);
  const task = codingData<CodingTaskWithUsage>(body);
  if (!task) throw new Error('تعذّر تحميل المهمة.');
  return task;
}

export function deleteCodingTask(id: string): Promise<CodingOkResponse> {
  return write(`/api/coding/tasks/${encodeURIComponent(id)}`, { method: 'DELETE' });
}

/** A proposed step is either escalated to an edit or refused; nothing else writes. */
export function decideCodingStep(
  taskId: string,
  stepId: string,
  decision: DecideCodingStepInput['decision']
): Promise<CodingOkResponse> {
  return write(
    `/api/coding/tasks/${encodeURIComponent(taskId)}/steps/${encodeURIComponent(stepId)}/decide`,
    {
      method: 'POST',
      headers: JSON_HEADERS,
      body: JSON.stringify({ decision }),
    }
  );
}

export interface CodingConnectResult {
  url: string;
}

/** The GitHub App consent URL is the server's; the browser only follows it. */
export async function startCodingConnect(): Promise<CodingConnectResult> {
  const body = await request<unknown>('/api/coding/connect/start', {
    method: 'POST',
    credentials: 'same-origin',
  });
  const data = codingData<{ url?: string; authorizeUrl?: string }>(body);
  const url = data?.url ?? data?.authorizeUrl;
  if (!url || !/^https?:\/\//i.test(url)) throw new Error('تعذّر بدء الربط.');
  return { url };
}
