import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import type {
  CodingAdminRepository,
  CodingConnectAttemptRow,
  CodingInstallationRow,
  CodingLocalGrantRow,
  CodingRepository,
  CodingStepPatch,
  CodingStepRow,
  CodingTaskPatch,
  CodingTaskRow,
  CodingWorkspaceRow,
} from '@/backend/repositories/coding/coding-repository';
import { guardRepositoryMethods } from '@/backend/shared/repository-error';

type Client = SupabaseClient<Database>;
const nowIso = () => new Date().toISOString();

export function createCodingRepository(supabase: Client): CodingRepository {
  return guardRepositoryMethods<CodingRepository>({
    async listWorkspaces(userId) {
      const { data, error } = await supabase
        .from('coding_workspaces')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as CodingWorkspaceRow[];
    },

    async findWorkspace(userId, workspaceId) {
      const { data, error } = await supabase
        .from('coding_workspaces')
        .select('*')
        .eq('user_id', userId)
        .eq('id', workspaceId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as CodingWorkspaceRow | null) ?? null;
    },

    async createWorkspace(userId, values) {
      const { data, error } = await supabase
        .from('coding_workspaces')
        .insert({
          user_id: userId,
          installation_id: values.installationId,
          repo_owner: values.repoOwner,
          repo_name: values.repoName,
          default_branch: values.defaultBranch,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as CodingWorkspaceRow;
    },

    async deleteWorkspace(userId, workspaceId) {
      const { data, error } = await supabase
        .from('coding_workspaces')
        .delete()
        .eq('user_id', userId)
        .eq('id', workspaceId)
        .select('id');
      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },

    async countTasksSince(userId, sinceIso) {
      const { count, error } = await supabase
        .from('coding_tasks')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', sinceIso);
      if (error) throw new Error(error.message);
      return count ?? 0;
    },

    async createTask(userId, values) {
      const { data, error } = await supabase
        .from('coding_tasks')
        .insert({
          user_id: userId,
          workspace_id: values.workspaceId,
          title: values.title,
          instruction: values.instruction,
          mode: values.mode,
          base_branch: values.baseBranch,
          runner_minutes: values.runnerMinutes,
          callback_token_hash: values.callbackTokenHash,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as CodingTaskRow;
    },

    async findTask(userId, taskId) {
      const { data, error } = await supabase
        .from('coding_tasks')
        .select('*')
        .eq('user_id', userId)
        .eq('id', taskId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as CodingTaskRow | null) ?? null;
    },

    async listTasks(userId, page) {
      let query = supabase
        .from('coding_tasks')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .limit(page.limit + 1);
      if (page.before && page.beforeId) {
        query = query.or(
          `created_at.lt.${page.before},and(created_at.eq.${page.before},id.lt.${page.beforeId})`
        );
      } else if (page.before) {
        query = query.lt('created_at', page.before);
      }
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as CodingTaskRow[];
    },

    async listSteps(userId, taskId) {
      const { data, error } = await supabase
        .from('coding_steps')
        .select('*')
        .eq('user_id', userId)
        .eq('task_id', taskId)
        .order('created_at', { ascending: true })
        .order('id', { ascending: true });
      if (error) throw new Error(error.message);
      return (data ?? []) as CodingStepRow[];
    },

    async updateTask(userId, taskId, patch: CodingTaskPatch) {
      const { error } = await supabase
        .from('coding_tasks')
        .update(patch)
        .eq('user_id', userId)
        .eq('id', taskId);
      if (error) throw new Error(error.message);
    },

    async insertStep(userId, values) {
      const { data, error } = await supabase
        .from('coding_steps')
        .insert({
          user_id: userId,
          task_id: values.taskId,
          kind: values.kind,
          status: values.status,
          summary: values.summary,
          diff: values.diff ?? null,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as CodingStepRow;
    },

    async updateStep(userId, stepId, patch: CodingStepPatch) {
      const { error } = await supabase
        .from('coding_steps')
        .update(patch)
        .eq('user_id', userId)
        .eq('id', stepId);
      if (error) throw new Error(error.message);
    },

    async findProposedStep(userId, taskId) {
      const { data, error } = await supabase
        .from('coding_steps')
        .select('*')
        .eq('user_id', userId)
        .eq('task_id', taskId)
        .eq('status', 'proposed')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as CodingStepRow | null) ?? null;
    },
  });
}

export function createCodingAdminRepository(supabase: Client): CodingAdminRepository {
  return guardRepositoryMethods<CodingAdminRepository>({
    async saveConnectAttempt(stateHash, userId, expiresAt) {
      const { error } = await supabase
        .from('coding_connect_attempts')
        .insert({ state_hash: stateHash, user_id: userId, expires_at: expiresAt });
      if (error) throw new Error(error.message);
    },

    async claimConnectAttempt(stateHash) {
      const { data, error } = await supabase
        .from('coding_connect_attempts')
        .delete()
        .eq('state_hash', stateHash)
        .gt('expires_at', nowIso())
        .select('*')
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as CodingConnectAttemptRow | null) ?? null;
    },

    async findInstallation(userId, installationId) {
      const { data, error } = await supabase
        .from('coding_installations')
        .select('*')
        .eq('user_id', userId)
        .eq('installation_id', installationId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as CodingInstallationRow | null) ?? null;
    },

    async listInstallations(userId) {
      const { data, error } = await supabase
        .from('coding_installations')
        .select('*')
        .eq('user_id', userId);
      if (error) throw new Error(error.message);
      return (data ?? []) as CodingInstallationRow[];
    },

    async hasInstallationForUser(userId) {
      const { data, error } = await supabase
        .from('coding_installations')
        .select('id')
        .eq('user_id', userId)
        .limit(1);
      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },

    async saveInstallation(userId, values) {
      const { error } = await supabase.from('coding_installations').upsert(
        {
          user_id: userId,
          installation_id: values.installationId,
          account_login: values.accountLogin,
          account_type: values.accountType,
          repository_selection: values.repositorySelection,
          token_enc: values.tokenEnc,
          token_expires_at: values.tokenExpiresAt,
          updated_at: nowIso(),
        },
        { onConflict: 'user_id,installation_id' }
      );
      if (error) throw new Error(error.message);
    },

    async findTaskByCallbackHash(hash) {
      const { data, error } = await supabase
        .from('coding_tasks')
        .select('*')
        .eq('callback_token_hash', hash)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as CodingTaskRow | null) ?? null;
    },

    async updateTaskByCallbackHash(hash, patch: CodingTaskPatch) {
      const { error } = await supabase
        .from('coding_tasks')
        .update(patch)
        .eq('callback_token_hash', hash);
      if (error) throw new Error(error.message);
    },

    async insertStepForRunner(userId, values) {
      const { error } = await supabase.from('coding_steps').insert({
        user_id: userId,
        task_id: values.taskId,
        kind: values.kind,
        status: values.status,
        summary: values.summary,
        diff: values.diff ?? null,
        failure_code: values.failureCode ?? null,
        input_tokens: values.inputTokens ?? 0,
        output_tokens: values.outputTokens ?? 0,
      });
      if (error) throw new Error(error.message);
    },

    async setStepDecision(userId, stepId, status) {
      const { error } = await supabase
        .from('coding_steps')
        .update({ status })
        .eq('user_id', userId)
        .eq('id', stepId);
      if (error) throw new Error(error.message);
    },

    async createLocalWorkspace(userId, values) {
      const { data, error } = await supabase
        .from('coding_workspaces')
        .insert({
          user_id: userId,
          kind: 'local',
          device_label: values.deviceLabel,
          installation_id: null,
          repo_owner: null,
          repo_name: null,
          default_branch: null,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as CodingWorkspaceRow;
    },

    async deleteWorkspace(userId, workspaceId) {
      const { data, error } = await supabase
        .from('coding_workspaces')
        .delete()
        .eq('user_id', userId)
        .eq('id', workspaceId)
        .select('id');
      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },

    async createLocalPair(userId, values) {
      const { data, error } = await supabase
        .from('coding_local_grants')
        .insert({
          user_id: userId,
          device_label: values.deviceLabel,
          pair_code_hash: values.codeHash,
          pair_expires_at: values.expiresAt,
        })
        .select('*')
        .single();
      if (error) throw new Error(error.message);
      return data as CodingLocalGrantRow;
    },

    async findLocalPair(codeHash) {
      const { data, error } = await supabase
        .from('coding_local_grants')
        .select('*')
        .eq('pair_code_hash', codeHash)
        .is('token_hash', null)
        .is('revoked_at', null)
        .gt('pair_expires_at', nowIso())
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as CodingLocalGrantRow | null) ?? null;
    },

    async claimLocalPair(id, values) {
      // The `token_hash is null` guard is the race: two companions presenting the
      // same code can both read the row, but only one update matches.
      const { data, error } = await supabase
        .from('coding_local_grants')
        .update({
          token_hash: values.tokenHash,
          workspace_id: values.workspaceId,
          claimed_at: nowIso(),
          pair_code_hash: null,
          pair_expires_at: null,
        })
        .eq('id', id)
        .is('token_hash', null)
        .gt('pair_expires_at', nowIso())
        .select('*')
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as CodingLocalGrantRow | null) ?? null;
    },

    async findLocalGrantByTokenHash(hash) {
      const { data, error } = await supabase
        .from('coding_local_grants')
        .select('*')
        .eq('token_hash', hash)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as CodingLocalGrantRow | null) ?? null;
    },

    async findActiveGrantForWorkspace(userId, workspaceId) {
      const { data, error } = await supabase
        .from('coding_local_grants')
        .select('*')
        .eq('user_id', userId)
        .eq('workspace_id', workspaceId)
        .is('revoked_at', null)
        .not('token_hash', 'is', null)
        .limit(1)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as CodingLocalGrantRow | null) ?? null;
    },

    async listLocalGrants(userId) {
      const { data, error } = await supabase
        .from('coding_local_grants')
        .select('*')
        .eq('user_id', userId)
        .not('token_hash', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as CodingLocalGrantRow[];
    },

    async touchLocalGrant(id, at) {
      const { error } = await supabase
        .from('coding_local_grants')
        .update({ last_seen_at: at })
        .eq('id', id);
      if (error) throw new Error(error.message);
    },

    async revokeLocalGrant(userId, id, at) {
      const { data, error } = await supabase
        .from('coding_local_grants')
        .update({ revoked_at: at })
        .eq('user_id', userId)
        .eq('id', id)
        .is('revoked_at', null)
        .select('id');
      if (error) throw new Error(error.message);
      return (data ?? []).length > 0;
    },

    async claimNextLocalTask(userId, workspaceId, callbackTokenHash) {
      // Read the oldest queued task, then claim it with `status = 'queued'` in
      // the update: the second writer's update matches nothing and retries on
      // the next task instead of running one twice.
      for (let attempt = 0; attempt < 3; attempt++) {
        const { data: next, error: readError } = await supabase
          .from('coding_tasks')
          .select('id')
          .eq('user_id', userId)
          .eq('workspace_id', workspaceId)
          .eq('status', 'queued')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle();
        if (readError) throw new Error(readError.message);
        if (!next) return null;

        const { data: claimed, error: updateError } = await supabase
          .from('coding_tasks')
          .update({
            status: 'running',
            callback_token_hash: callbackTokenHash,
            updated_at: nowIso(),
          })
          .eq('id', (next as { id: string }).id)
          .eq('status', 'queued')
          .select('*')
          .maybeSingle();
        if (updateError) throw new Error(updateError.message);
        if (claimed) return claimed as CodingTaskRow;
      }
      return null;
    },

    async failActiveTasksForWorkspace(userId, workspaceId, failureCode) {
      const { error } = await supabase
        .from('coding_tasks')
        .update({ status: 'failed', failure_code: failureCode, updated_at: nowIso() })
        .eq('user_id', userId)
        .eq('workspace_id', workspaceId)
        .in('status', ['queued', 'running', 'awaiting_plan', 'awaiting_push']);
      if (error) throw new Error(error.message);
    },
  });
}
