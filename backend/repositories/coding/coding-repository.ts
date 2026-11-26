/**
 * Persistence boundary for the coding agent (ADR-0219).
 *
 * `CodingRepository` takes the member's own Supabase client: RLS is the
 * authorization check, so every read and write must carry `userId`.
 * `CodingAdminRepository` takes the service-role client and is the only code
 * allowed near encrypted installation tokens, OAuth state and runner tokens.
 */

import type { Database } from '@/backend/models/database.types';

export type CodingWorkspaceRow = Database['public']['Tables']['coding_workspaces']['Row'];
export type CodingTaskRow = Database['public']['Tables']['coding_tasks']['Row'];
export type CodingStepRow = Database['public']['Tables']['coding_steps']['Row'];
export type CodingInstallationRow = Database['public']['Tables']['coding_installations']['Row'];
export type CodingConnectAttemptRow =
  Database['public']['Tables']['coding_connect_attempts']['Row'];
export type CodingLocalGrantRow = Database['public']['Tables']['coding_local_grants']['Row'];

export type CodingTaskPatch = Partial<
  Pick<
    CodingTaskRow,
    | 'status'
    | 'branch'
    | 'pull_request_url'
    | 'summary'
    | 'failure_code'
    | 'input_tokens'
    | 'output_tokens'
    | 'callback_token_hash'
  >
>;

export type CodingStepPatch = Partial<
  Pick<
    CodingStepRow,
    'status' | 'summary' | 'diff' | 'failure_code' | 'input_tokens' | 'output_tokens'
  >
>;

export interface CodingRepository {
  listWorkspaces(userId: string): Promise<CodingWorkspaceRow[]>;
  findWorkspace(userId: string, workspaceId: string): Promise<CodingWorkspaceRow | null>;
  createWorkspace(
    userId: string,
    values: {
      installationId: number;
      repoOwner: string;
      repoName: string;
      defaultBranch: string;
    }
  ): Promise<CodingWorkspaceRow>;
  deleteWorkspace(userId: string, workspaceId: string): Promise<boolean>;
  countTasksSince(userId: string, sinceIso: string): Promise<number>;
  createTask(
    userId: string,
    values: {
      workspaceId: string;
      title: string;
      instruction: string;
      mode: string;
      baseBranch: string;
      runnerMinutes: number;
      callbackTokenHash: string;
    }
  ): Promise<CodingTaskRow>;
  findTask(userId: string, taskId: string): Promise<CodingTaskRow | null>;
  listTasks(
    userId: string,
    page: { limit: number; before: string | null; beforeId: string | null }
  ): Promise<CodingTaskRow[]>;
  listSteps(userId: string, taskId: string): Promise<CodingStepRow[]>;
  updateTask(userId: string, taskId: string, patch: CodingTaskPatch): Promise<void>;
  insertStep(
    userId: string,
    values: {
      taskId: string;
      kind: string;
      status: string;
      summary: string;
      diff?: string | null;
    }
  ): Promise<CodingStepRow>;
  updateStep(userId: string, stepId: string, patch: CodingStepPatch): Promise<void>;
  findProposedStep(userId: string, taskId: string): Promise<CodingStepRow | null>;
}

export interface CodingAdminRepository {
  saveConnectAttempt(stateHash: string, userId: string, expiresAt: string): Promise<void>;
  claimConnectAttempt(stateHash: string): Promise<CodingConnectAttemptRow | null>;
  findInstallation(userId: string, installationId: number): Promise<CodingInstallationRow | null>;
  /** Every installation this member connected, for a repo picker on the site. */
  listInstallations(userId: string): Promise<CodingInstallationRow[]>;
  /** A repeated callback is harmless when this member already has an installation. */
  hasInstallationForUser(userId: string): Promise<boolean>;
  saveInstallation(
    userId: string,
    values: {
      installationId: number;
      accountLogin: string;
      accountType: string;
      repositorySelection: string;
      tokenEnc: string;
      tokenExpiresAt: string;
    }
  ): Promise<void>;
  findTaskByCallbackHash(hash: string): Promise<CodingTaskRow | null>;
  updateTaskByCallbackHash(hash: string, patch: CodingTaskPatch): Promise<void>;
  insertStepForRunner(
    userId: string,
    values: {
      taskId: string;
      kind: string;
      status: string;
      summary: string;
      diff?: string | null;
      failureCode?: string | null;
      inputTokens?: number;
      outputTokens?: number;
    }
  ): Promise<void>;
  /** The runner reads decisions with this client, so write them with it too. */
  setStepDecision(userId: string, stepId: string, status: 'applied' | 'rejected'): Promise<void>;

  // ---- the local companion (ADR-0222) -------------------------------------

  /** A folder grant creates its own workspace: the companion has no session. */
  createLocalWorkspace(
    userId: string,
    values: { deviceLabel: string }
  ): Promise<CodingWorkspaceRow>;
  /** Compensating delete when a pairing claim lost a race. */
  deleteWorkspace(userId: string, workspaceId: string): Promise<boolean>;
  /** A pairing row: a device label and the digest of a one-time code. */
  createLocalPair(
    userId: string,
    values: { deviceLabel: string; codeHash: string; expiresAt: string }
  ): Promise<CodingLocalGrantRow>;
  /** Only an unclaimed, unexpired code resolves; claiming clears it. */
  findLocalPair(codeHash: string): Promise<CodingLocalGrantRow | null>;
  /** Atomic: the update is refused when another device claimed the code first. */
  claimLocalPair(
    id: string,
    values: { tokenHash: string; workspaceId: string }
  ): Promise<CodingLocalGrantRow | null>;
  findLocalGrantByTokenHash(hash: string): Promise<CodingLocalGrantRow | null>;
  findActiveGrantForWorkspace(
    userId: string,
    workspaceId: string
  ): Promise<CodingLocalGrantRow | null>;
  listLocalGrants(userId: string): Promise<CodingLocalGrantRow[]>;
  touchLocalGrant(id: string, at: string): Promise<void>;
  revokeLocalGrant(userId: string, id: string, at: string): Promise<boolean>;
  /** One queued task, moved to running for this device. Null when none is waiting. */
  claimNextLocalTask(
    userId: string,
    workspaceId: string,
    callbackTokenHash: string
  ): Promise<CodingTaskRow | null>;
  /** Revocation stops the work a device still has in flight. */
  failActiveTasksForWorkspace(
    userId: string,
    workspaceId: string,
    failureCode: string
  ): Promise<void>;
}
