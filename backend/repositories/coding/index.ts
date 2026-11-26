import type { SupabaseClient } from '@supabase/supabase-js';

import type { Database } from '@/backend/models/database.types';
import type {
  CodingAdminRepository,
  CodingConnectAttemptRow,
  CodingInstallationRow,
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
  });
}
