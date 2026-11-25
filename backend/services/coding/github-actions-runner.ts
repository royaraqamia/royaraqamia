/**
 * The GitHub-hosted adapter for `SandboxRunner` (ADR-0219).
 *
 * A task becomes one `workflow_dispatch` on the member's repository. The member
 * pays for the Actions minutes; the platform keeps no runner and no long-lived
 * repository credential. Depend on the client's shape rather than on the
 * composition root, so this adapter can be constructed in a test with a stub.
 */

import type { GitHubAppClient } from '@/backend/clients/github-app';
import type { CodingRunnerTask } from '@/shared/contracts/coding-agent';

import type { SandboxRunner } from './sandbox-runner';

/**
 * The control plane sends the one-time callback token to the runner as a
 * workflow input. `CodingRunnerTask` currently exposes only its SHA-256 digest,
 * so that raw value travels as an optional extra field on the spec until the
 * contract is extended. The digest must never be sent as if it were the token.
 */
type RunnerTaskSpec = CodingRunnerTask & { callbackToken?: string };

export class GitHubActionsRunner implements SandboxRunner {
  constructor(private readonly client: GitHubAppClient) {}

  async start(
    spec: CodingRunnerTask,
    credential: { installationToken: string }
  ): Promise<{ runId: string }> {
    const callbackToken = (spec as RunnerTaskSpec).callbackToken;
    if (!callbackToken) {
      throw new Error(
        'Coding runner task has no callbackToken: pass the one-time token, not callbackTokenHash.'
      );
    }

    // The workflow downloads the runner script from the same origin that serves
    // the callback endpoints; both are public, static URLs.
    const runnerUrl = new URL('/coding/runner-v1.mjs', spec.callbackUrl).toString();

    // The spec that reaches the repository carries no credential. The token is
    // passed as its own workflow input and as NOOR_CALLBACK_TOKEN only.
    const wireSpec = Object.fromEntries(
      Object.entries(spec).filter(([key]) => key !== 'callbackToken')
    ) as CodingRunnerTask;

    await this.client.dispatchWorkflow({
      token: credential.installationToken,
      owner: spec.repoOwner,
      repo: spec.repoName,
      ref: spec.baseBranch,
      inputs: {
        task_id: spec.taskId,
        callback_url: spec.callbackUrl,
        callback_token: callbackToken,
        runner_minutes: String(spec.caps.runnerMinutes),
        max_input_tokens: String(spec.caps.maxInputTokens),
        max_output_tokens: String(spec.caps.maxOutputTokens),
        runner_url: runnerUrl,
        task_json: JSON.stringify(wireSpec),
      },
    });

    // GitHub's dispatch endpoint answers 204 and does not name the run it
    // created. The task id is the correlation handle; status and evidence come
    // back over the callback route, never by polling GitHub from the control
    // plane (that would need a second credential and a provider-specific path).
    return { runId: spec.taskId };
  }
}
