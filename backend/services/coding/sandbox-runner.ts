/**
 * The execution-plane port (ADR-0219).
 *
 * The control plane starts a task on a runner and then learns about progress
 * through task-scoped HTTP callbacks. `status`, `logs` and `cancel` are
 * deliberately deferred to that phase 1 callback model: polling a provider's
 * own API would give the control plane a second, provider-specific path to
 * maintain and a reason to hold the member's repository credential longer.
 *
 * The runner is handed a short-lived installation token for exactly one task.
 * It never receives the model key, Supabase keys or any other member's data.
 */

import type { CodingRunnerTask } from '@/shared/contracts/coding-agent';

export interface SandboxRunner {
  start(
    spec: CodingRunnerTask,
    credential: { installationToken: string }
  ): Promise<{ runId: string }>;
}
