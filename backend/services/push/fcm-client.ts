import { createSign } from 'crypto';
import { logger } from '@/backend/shared/logger';
import type { PushPayload } from '@/shared/contracts/push';

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const MESSAGING_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const FCM_BASE_URL = 'https://fcm.googleapis.com/v1/projects';

/** Must match `com.google.firebase.messaging.default_notification_channel_id` in AndroidManifest.xml. */
export const FCM_CHANNEL_ID = 'default';

const JWT_LIFETIME_SECONDS = 3600;
/** Refresh the cached OAuth token this far ahead of expiry (clock skew + in-flight requests). */
const TOKEN_REFRESH_SKEW_MS = 60_000;

export interface FcmSendError extends Error {
  /** HTTP status from the FCM API; drives the retry policy. */
  statusCode?: number;
  /** FCM's machine-readable reason, e.g. `UNREGISTERED`. */
  errorCode?: string;
}

export interface FcmAdapter {
  send(token: string, payload: PushPayload): Promise<void>;
}

export interface FcmClientOptions {
  projectId: string;
  clientEmail: string;
  privateKey: string;
  channelId?: string;
  fetchImpl?: typeof fetch;
  now?: () => number;
}

function base64Url(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64url');
}

/**
 * The RS256 assertion that buys an OAuth token from Google. Built and signed
 * locally — there is no Firebase SDK in this project, and pulling one in for a
 * single HTTP call would put a client library in every serverless bundle.
 */
export function createServiceAccountAssertion(options: {
  clientEmail: string;
  privateKey: string;
  nowSeconds: number;
}): string {
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claims = base64Url(
    JSON.stringify({
      iss: options.clientEmail,
      scope: MESSAGING_SCOPE,
      aud: TOKEN_URL,
      iat: options.nowSeconds,
      exp: options.nowSeconds + JWT_LIFETIME_SECONDS,
    })
  );

  const signer = createSign('RSA-SHA256');
  signer.update(`${header}.${claims}`);
  signer.end();
  return `${header}.${claims}.${signer.sign(options.privateKey, 'base64url')}`;
}

/**
 * FCM tells a sender a token is dead in two ways: `UNREGISTERED` (app
 * uninstalled or token rotated) and `SENDER_ID_MISMATCH` (the token belongs to
 * another Firebase project — a stale build, or a token from a different app).
 * Only those prune. `INVALID_ARGUMENT` is NOT treated as dead: it also covers a
 * malformed message, and pruning every token over a payload bug would be a
 * self-inflicted outage.
 */
export function isDeadTokenError(error: unknown): boolean {
  const code = (error as FcmSendError).errorCode;
  return code === 'UNREGISTERED' || code === 'SENDER_ID_MISMATCH';
}

function toSendError(status: number, body: unknown): FcmSendError {
  const detail = (
    body as {
      error?: { status?: string; details?: Array<{ errorCode?: string }> };
    }
  )?.error;
  const errorCode =
    detail?.details?.find((entry) => typeof entry?.errorCode === 'string')?.errorCode ??
    detail?.status;
  const error = new Error(
    `FCM send failed (${status}${errorCode ? ` ${errorCode}` : ''})`
  ) as FcmSendError;
  error.statusCode = status;
  error.errorCode = errorCode;
  return error;
}

function buildMessage(
  token: string,
  payload: PushPayload,
  channelId: string
): Record<string, unknown> {
  // FCM requires every data value to be a string; the client reads `url` to
  // route a tap, so it is always present (falls back to the site root).
  const data: Record<string, string> = { url: payload.url ?? '/' };
  if (payload.type) data.type = payload.type;
  if (payload.notificationId) data.notificationId = payload.notificationId;

  return {
    message: {
      token,
      notification: {
        title: payload.title,
        ...(payload.body ? { body: payload.body } : {}),
      },
      data,
      android: {
        priority: 'high',
        notification: { channel_id: channelId },
      },
    },
  };
}

/**
 * FCM HTTP v1 adapter. Authenticates with the Firebase service account (JWT →
 * OAuth access token, cached for its lifetime) and posts one message per token.
 * Never used by the browser: the shell's tokens arrive through the push plugin.
 */
export function createFcmAdapter(options: FcmClientOptions): FcmAdapter {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const channelId = options.channelId ?? FCM_CHANNEL_ID;
  const endpoint = `${FCM_BASE_URL}/${options.projectId}/messages:send`;

  let cachedToken: { value: string; expiresAt: number } | null = null;

  async function accessToken(): Promise<string> {
    if (cachedToken && now() < cachedToken.expiresAt) return cachedToken.value;

    const assertion = createServiceAccountAssertion({
      clientEmail: options.clientEmail,
      privateKey: options.privateKey,
      nowSeconds: Math.floor(now() / 1000),
    });

    const response = await fetchImpl(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
      }).toString(),
    });

    if (!response.ok) {
      // 400/401 here means the service account itself is wrong (rotated key,
      // typo in the PEM) — permanent until someone fixes the environment.
      throw toSendError(response.status, await response.json().catch(() => null));
    }

    const body = (await response.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) {
      throw toSendError(response.status, body);
    }

    cachedToken = {
      value: body.access_token,
      expiresAt: now() + Math.max(0, (body.expires_in ?? 0) * 1000 - TOKEN_REFRESH_SKEW_MS),
    };
    return cachedToken.value;
  }

  return {
    async send(token, payload) {
      const bearer = await accessToken();
      const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${bearer}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(buildMessage(token, payload, channelId)),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        const error = toSendError(response.status, body);
        // A rejected access token is worth one silent retry: the cached value
        // may have been revoked (key rotation) while this instance kept it.
        if (response.status === 401) cachedToken = null;
        logger.warn('FCM rejected a message', {
          status: error.statusCode ?? null,
          errorCode: error.errorCode ?? null,
        });
        throw error;
      }
    },
  };
}
