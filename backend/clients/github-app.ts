/**
 * GitHub App and OAuth client for the coding agent (ADR-0219).
 *
 * The control plane owns the App's identity and the model key; the member's
 * repository is reached with a short-lived installation token that is handed to
 * this client by the caller. Nothing here reads a database, and nothing here
 * keeps a credential: every method takes what it needs as an argument.
 *
 * Config is read from the process environment at call time through `read()` so
 * a deployment can supply the values without a second config module. The PEM
 * may be stored with literal `\n` sequences (secret managers commonly do), so
 * `privateKey()` folds those into real newlines before signing.
 */

import { createSign } from 'node:crypto';

const GITHUB_API = 'https://api.github.com';
const TIMEOUT_MS = 20_000;
const USER_AGENT = 'royaraqamia-coding-agent';
const JWT_LIFETIME_SECONDS = 9 * 60;

export interface GitHubInstallation {
  id: number;
  account: { login: string; type: string };
  repository_selection: string;
}

export interface GitHubInstallationToken {
  token: string;
  expiresAt: string;
}

export interface GitHubWorkflowRun {
  status: string;
  conclusion: string | null;
}

export interface GitHubRepository {
  owner: string;
  name: string;
  default_branch: string;
}

export interface GitHubPullRequest {
  htmlUrl: string;
  number: number;
}

export interface GitHubAppClient {
  authorizeUrl(state: string): string;
  exchangeUserCode(code: string): Promise<{ accessToken: string; scope: string }>;
  listInstallations(userToken: string): Promise<GitHubInstallation[]>;
  createAppJwt(): string;
  getInstallationToken(installationId: number): Promise<GitHubInstallationToken>;
  dispatchWorkflow(input: {
    token: string;
    owner: string;
    repo: string;
    ref: string;
    inputs: Record<string, string>;
  }): Promise<void>;
  getWorkflowRun(input: {
    token: string;
    owner: string;
    repo: string;
    runId: number;
  }): Promise<GitHubWorkflowRun>;
  listRepos(input: { token: string; perPage?: number }): Promise<GitHubRepository[]>;
  createPullRequest(input: {
    token: string;
    owner: string;
    repo: string;
    head: string;
    base: string;
    title: string;
    body: string;
  }): Promise<GitHubPullRequest>;
  /** Bootstrap helpers for the workflow file a member must install once per repo. */
  getRef(input: {
    token: string;
    owner: string;
    repo: string;
    ref: string;
  }): Promise<{ sha: string }>;
  createRef(input: {
    token: string;
    owner: string;
    repo: string;
    ref: string;
    sha: string;
  }): Promise<void>;
  getFile(input: {
    token: string;
    owner: string;
    repo: string;
    path: string;
    ref?: string;
  }): Promise<{ sha: string; content: string } | null>;
  createFile(input: {
    token: string;
    owner: string;
    repo: string;
    path: string;
    branch: string;
    content: string;
    message: string;
  }): Promise<void>;
}

function read(name: string): string {
  return (process.env[name] ?? '').trim();
}

function required(name: string): string {
  const value = read(name);
  if (!value) throw new Error(`GitHub App is not configured: ${name} is missing.`);
  return value;
}

function privateKey(): string {
  return required('GITHUB_APP_PRIVATE_KEY').replace(/\\n/g, '\n');
}

function base64url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

/** One bounded request. A non-2xx becomes an error that names the operation. */
async function request(url: string, init: RequestInit, label: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      ...init,
      cache: 'no-store',
      signal: controller.signal,
      headers: {
        'User-Agent': USER_AGENT,
        Accept: 'application/vnd.github+json',
        ...init.headers,
      },
    });
    if (!response.ok) {
      const body = (await response.text().catch(() => '')).slice(0, 500);
      const detail = body ? ` - ${body}` : '';
      throw new Error(`${label} failed: GitHub answered ${response.status}${detail}`);
    }
    return response;
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`${label} failed: GitHub did not answer within ${TIMEOUT_MS} ms`, {
        cause: error,
      });
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function jsonBody<T>(response: Response, label: string): Promise<T> {
  try {
    return (await response.json()) as T;
  } catch {
    throw new Error(`${label} failed: GitHub returned an unreadable body`);
  }
}

export function createGitHubAppClient(): GitHubAppClient {
  return {
    authorizeUrl(state) {
      const params = new URLSearchParams({
        client_id: required('GITHUB_APP_CLIENT_ID'),
        state,
        scope: 'read:user',
      });
      return `https://github.com/login/oauth/authorize?${params.toString()}`;
    },

    async exchangeUserCode(code) {
      const body = new URLSearchParams({
        client_id: required('GITHUB_APP_CLIENT_ID'),
        client_secret: required('GITHUB_APP_CLIENT_SECRET'),
        code,
      });
      const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          'User-Agent': USER_AGENT,
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: body.toString(),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      const payload = await jsonBody<{
        access_token?: string;
        scope?: string;
        error?: string;
        error_description?: string;
      }>(response, 'GitHub OAuth token exchange');
      if (!response.ok || !payload.access_token) {
        throw new Error(
          `GitHub OAuth token exchange failed: ${payload.error_description ?? payload.error ?? `status ${response.status}`}`
        );
      }
      return { accessToken: payload.access_token, scope: payload.scope ?? '' };
    },

    async listInstallations(userToken) {
      const response = await request(
        `${GITHUB_API}/user/installations?per_page=100`,
        {
          headers: { Authorization: `Bearer ${userToken}` },
        },
        'GitHub installation list'
      );
      const payload = await jsonBody<{ installations?: GitHubInstallation[] }>(
        response,
        'GitHub installation list'
      );
      return (payload.installations ?? []).map((installation) => ({
        id: installation.id,
        account: {
          login: installation.account.login,
          type: installation.account.type,
        },
        repository_selection: installation.repository_selection,
      }));
    },

    createAppJwt() {
      const now = Math.floor(Date.now() / 1_000);
      const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
      const claims = base64url(
        JSON.stringify({
          iss: required('GITHUB_APP_ID'),
          iat: now,
          exp: now + JWT_LIFETIME_SECONDS,
        })
      );
      const signingInput = `${header}.${claims}`;
      const signer = createSign('RSA-SHA256');
      signer.update(signingInput);
      signer.end();
      return `${signingInput}.${signer.sign(privateKey(), 'base64url')}`;
    },

    async getInstallationToken(installationId) {
      const jwt = this.createAppJwt();
      const response = await request(
        `${GITHUB_API}/app/installations/${encodeURIComponent(String(installationId))}/access_tokens`,
        { method: 'POST', headers: { Authorization: `Bearer ${jwt}` } },
        'GitHub installation token'
      );
      const payload = await jsonBody<{ token?: string; expires_at?: string }>(
        response,
        'GitHub installation token'
      );
      if (!payload.token || !payload.expires_at) {
        throw new Error('GitHub installation token response was missing token or expires_at');
      }
      return { token: payload.token, expiresAt: payload.expires_at };
    },

    async dispatchWorkflow({ token, owner, repo, ref, inputs }) {
      const response = await request(
        `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/workflows/noor-coding.yml/dispatches`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ref, inputs }),
        },
        'GitHub workflow dispatch'
      );
      await response.body?.cancel().catch(() => undefined);
    },

    async getWorkflowRun({ token, owner, repo, runId }) {
      const response = await request(
        `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/actions/runs/${encodeURIComponent(String(runId))}`,
        { headers: { Authorization: `Bearer ${token}` } },
        'GitHub workflow run'
      );
      const payload = await jsonBody<{ status?: string; conclusion?: string | null }>(
        response,
        'GitHub workflow run'
      );
      if (!payload.status) throw new Error('GitHub workflow run response was missing status');
      return { status: payload.status, conclusion: payload.conclusion ?? null };
    },

    async listRepos({ token, perPage = 100 }) {
      const response = await request(
        `${GITHUB_API}/installation/repositories?per_page=${encodeURIComponent(String(perPage))}`,
        { headers: { Authorization: `Bearer ${token}` } },
        'GitHub installation repositories'
      );
      const payload = await jsonBody<{
        repositories?: Array<{
          name?: string;
          default_branch?: string;
          owner?: { login?: string };
        }>;
      }>(response, 'GitHub installation repositories');
      return (payload.repositories ?? []).flatMap((repo) => {
        if (!repo.name || !repo.owner?.login) return [];
        return [
          {
            owner: repo.owner.login,
            name: repo.name,
            default_branch: repo.default_branch ?? 'main',
          },
        ];
      });
    },

    async createPullRequest({ token, owner, repo, head, base, title, body }) {
      const response = await request(
        `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ head, base, title, body, draft: false }),
        },
        'GitHub pull request'
      );
      const payload = await jsonBody<{ html_url?: string; number?: number }>(
        response,
        'GitHub pull request'
      );
      if (!payload.html_url || typeof payload.number !== 'number') {
        throw new Error('GitHub pull request response was missing html_url or number');
      }
      return { htmlUrl: payload.html_url, number: payload.number };
    },

    async getRef({ token, owner, repo, ref }) {
      const response = await request(
        `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/ref/${ref}`,
        { headers: { Authorization: `Bearer ${token}` } },
        'GitHub ref'
      );
      const payload = await jsonBody<{ object?: { sha?: string } }>(response, 'GitHub ref');
      if (!payload.object?.sha) throw new Error('GitHub ref response was missing a sha');
      return { sha: payload.object.sha };
    },

    async createRef({ token, owner, repo, ref, sha }) {
      await request(
        `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/refs`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({ ref, sha }),
        },
        'GitHub create ref'
      );
    },

    async getFile({ token, owner, repo, path, ref }) {
      const query = ref ? `?ref=${encodeURIComponent(ref)}` : '';
      try {
        const response = await request(
          `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}${query}`,
          { headers: { Authorization: `Bearer ${token}` } },
          'GitHub file'
        );
        const payload = await jsonBody<{ sha?: string; content?: string }>(response, 'GitHub file');
        if (!payload.sha) return null;
        return { sha: payload.sha, content: payload.content ?? '' };
      } catch (error) {
        if (error instanceof Error && error.message.includes('404')) return null;
        throw error;
      }
    },

    async createFile({ token, owner, repo, path, branch, content, message }) {
      await request(
        `${GITHUB_API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/contents/${path}`,
        {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            message,
            content: Buffer.from(content, 'utf8').toString('base64'),
            branch,
          }),
        },
        'GitHub create file'
      );
    },
  };
}
