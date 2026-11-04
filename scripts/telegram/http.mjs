/**
 * The four services the bot talks to, and nothing above them.
 *
 * Every call here either succeeds or throws an error whose message is safe to
 * put in a log. Nothing throws an error whose message is safe to put in the
 * chat: that is `failureLine`'s job, because a Supabase 400 carries table names,
 * column names and the failing row's contents.
 */

import { botToken, githubToken, openCodeKey, sleep, supabaseKey, supabaseUrl } from './config.mjs';

const USER_AGENT = 'royaraqamia-telegram-bot/2.0';

/**
 * Telegram's own limits are 30 messages/second overall and 20 edits/minute to
 * one chat. The bridge stays far below both, and a 429 is honoured rather than
 * retried immediately - a retry that ignores `retry_after` makes it worse.
 */
export async function telegram(method, payload) {
  const token = botToken();
  if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));

    if (data.ok) return data.result;

    const retryAfter = Number(data.parameters?.retry_after ?? 0);
    const retryable = response.status === 429 || response.status >= 500;
    if (retryable && attempt < 3) {
      await sleep(Math.min(retryAfter || 2 ** attempt, 30) * 1000);
      continue;
    }
    throw new Error(`Telegram ${method} failed: ${data.description ?? response.status}`);
  }

  throw new Error(`Telegram ${method} failed after 4 attempts`);
}

export function supabaseHeaders() {
  const key = supabaseKey();
  return {
    apikey: key,
    authorization: `Bearer ${key}`,
    'content-type': 'application/json',
  };
}

/**
 * PostgREST. `prefer` decides whether an insert replaces, ignores a duplicate,
 * or (with `return=representation`) tells us whether the row was ours to claim.
 */
export async function db(path, init = {}) {
  const base = supabaseUrl();
  if (!base || !supabaseKey()) throw new Error('Supabase URL or service role key is not set');

  const response = await fetch(`${base}/rest/v1/${path}`, {
    ...init,
    headers: { ...supabaseHeaders(), ...(init.headers ?? {}) },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `Supabase ${path.split('?')[0]} failed: ${response.status} ${body.slice(0, 300)}`
    );
  }

  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

export async function github(path, init = {}, token = githubToken()) {
  if (!token) throw new Error('GITHUB_TOKEN is not set');

  const response = await fetch(`https://api.github.com${path}`, {
    ...init,
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': USER_AGENT,
      'x-github-api-version': '2022-11-28',
      ...(init.headers ?? {}),
    },
  });

  if (response.status === 404) return null;
  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(
      `GitHub ${path.split('?')[0]} failed: ${response.status} ${body.slice(0, 300)}`
    );
  }
  return response.status === 204 ? null : response.json();
}

/**
 * One chat completion, used for the two jobs that are not the agent: turning a
 * voice note into text, and distilling the conversation into memory. The agent
 * itself is a process (see `agent.mjs`), not an HTTP call.
 */
export async function askModel(messages, { model, tools, temperature = 0.4 } = {}) {
  const key = openCodeKey();
  if (!key) throw new Error('OPENCODE_API_KEY is not set');

  const response = await fetch('https://opencode.ai/inference/go/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${key}`,
      'content-type': 'application/json',
      'user-agent': USER_AGENT,
      'x-opencode-session': 'bridge',
    },
    body: JSON.stringify({
      model,
      temperature,
      messages,
      ...(tools ? { tools, tool_choice: 'auto' } : {}),
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    throw new Error(`inference failed: ${response.status} ${body.slice(0, 300)}`);
  }

  const data = await response.json();
  return data?.choices?.[0]?.message ?? {};
}
