import type {
  AgentMemoryActionResult,
  AgentMemoryEdit,
  AgentMemoryFact,
  AgentMemoryListResult,
  AgentMemorySettings,
  AgentMemorySettingsPatch,
} from '@/shared/contracts/agent-memory';
import { request } from '@/frontend/transport/http';

/**
 * The memory page's transport (ADR-0182 decision 6, #1428).
 *
 * Three routes, and each answers the contract the app decodes: the read, one
 * fact's edit and delete, and the switches. A refusal arrives as an Arabic
 * sentence from the server (a scope that is off, a fact that is not there) and is
 * shown rather than swallowed — "it did not work" and "there was nothing there"
 * are different sentences.
 */

export const MEMORY_PATH = '/api/account/memory';

export async function getAgentMemory(): Promise<{
  facts: AgentMemoryFact[];
  settings: AgentMemorySettings;
}> {
  const result = await request<AgentMemoryListResult>(MEMORY_PATH, { cache: 'no-store' });
  const settings = result.settings ?? { account: true, product: true, thread: true };
  return { facts: result.facts ?? [], settings };
}

export async function editAgentMemory(id: string, patch: AgentMemoryEdit): Promise<void> {
  await request<AgentMemoryActionResult>(`${MEMORY_PATH}/${encodeURIComponent(id)}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
}

export async function forgetAgentMemory(id: string): Promise<void> {
  await request<AgentMemoryActionResult>(`${MEMORY_PATH}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function saveAgentMemorySettings(
  patch: AgentMemorySettingsPatch
): Promise<AgentMemorySettings> {
  const result = await request<AgentMemoryListResult>(`${MEMORY_PATH}/settings`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  });
  return result.settings ?? { account: true, product: true, thread: true };
}

/** The export is a download, not a read: a link, so the browser writes the file. */
export const MEMORY_EXPORT_PATH = `${MEMORY_PATH}/export`;
