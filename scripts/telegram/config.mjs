/**
 * Everything the bridge reads from the environment, in one place.
 *
 * The bridge runs on a GitHub runner, so every value here is a repository
 * secret or something the runner already provides. Nothing is read from a file:
 * a config file would be a second source of truth next to the workflow.
 */

export const DEFAULT_REPO = 'royaraqamia';

/** Telegram refuses a message over 4096 characters; stay under it with room for markup. */
export const MAX_TELEGRAM = 4000;

/** A status message is short by nature, and is edited in place, so it has its own ceiling. */
export const MAX_STATUS = 600;

export const DEFAULT_TZ_MINUTES = 180;

/**
 * The model, in the two shapes the two callers need.
 *
 * `MODEL` is the bare id the gateway's chat-completions API expects; `AGENT_MODEL`
 * is the same model as `opencode run --model` names it, provider first. Passing
 * the prefixed form to the API answers `Model is unavailable`, which is how the
 * title generator and the distiller would both have failed in production while
 * the agent worked.
 */
export const MODEL = 'deepseek-v4.1-flash';
export const AGENT_MODEL = 'opencode-go/deepseek-v4.1-flash';

/**
 * Cheapest first, and a failure steps over instead of ending the attempt.
 *
 * `gemini-4-argon` was the second candidate and was removed for cost, so the
 * only audio model left is the cheap one. A refusal now ends the attempt with an
 * honest message rather than a hidden second call to a dearer model.
 */
export const TRANSCRIBE_MODELS = ['mimo-v2.6-flash'];

const env = (name) => process.env[name]?.trim() || '';

export function botToken() {
  return env('TELEGRAM_BOT_TOKEN');
}

export function allowedChat() {
  return env('TELEGRAM_CHAT_ID');
}

export function supabaseUrl() {
  const explicit = env('SUPABASE_URL') || env('NEXT_PUBLIC_SUPABASE_URL');
  if (explicit) return explicit.replace(/\/$/, '');
  const ref = env('SUPABASE_PROJECT_REF');
  return ref ? `https://${ref}.supabase.co` : '';
}

export function supabaseKey() {
  return env('SUPABASE_SERVICE_ROLE_KEY');
}

export function supabaseProjectRef() {
  const explicit = env('SUPABASE_PROJECT_REF');
  if (explicit) return explicit;
  const url = supabaseUrl();
  const match = /^https:\/\/([a-z0-9]+)\.supabase\.co$/.exec(url);
  return match ? match[1] : '';
}

export function openCodeKey() {
  return env('OPENCODE_API_KEY');
}

export function githubToken() {
  return env('GITHUB_TOKEN');
}

/**
 * Owner and repository the bot acts on.
 *
 * One repository, deliberately: the workflow's `GITHUB_TOKEN` can reach exactly
 * one, and a bot that can name any repository is a bot that can write somewhere
 * nobody reviewed. Asking it for another repo gets a sentence, not a change.
 */
export function githubTarget() {
  const [owner, repo] = (env('GITHUB_REPOSITORY') || `${DEFAULT_REPO}/${DEFAULT_REPO}`).split('/');
  return { owner, repo: repo || DEFAULT_REPO };
}

export function workflowRunUrl() {
  const { GITHUB_SERVER_URL, GITHUB_REPOSITORY, GITHUB_RUN_ID } = process.env;
  if (!GITHUB_SERVER_URL || !GITHUB_REPOSITORY || !GITHUB_RUN_ID) return '';
  return `${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}`;
}

export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
