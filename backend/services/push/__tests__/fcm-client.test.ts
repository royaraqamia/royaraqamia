import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createVerify, generateKeyPairSync } from 'crypto';
import {
  createFcmAdapter,
  createServiceAccountAssertion,
  isDeadTokenError,
  FCM_CHANNEL_ID,
  type FcmSendError,
} from '@/backend/services/push/fcm-client';
import type { PushPayload } from '@/shared/contracts/push';

vi.mock('@/backend/shared/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const { privateKey, publicKey } = generateKeyPairSync('rsa', {
  modulusLength: 2048,
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const payload: PushPayload = {
  title: 'شهادة جديدة',
  body: 'نص',
  url: '/verify/COMP-1',
  type: 'certificate_issued',
  notificationId: 'n-1',
};

function jsonResponse(status: number, body: unknown) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function makeAdapter(
  handler: (url: string, init?: RequestInit) => Response,
  now: () => number = () => 1_700_000_000_000
) {
  const fetchMock = vi.fn(async (input: unknown, init?: RequestInit) =>
    handler(String(input), init)
  );
  const adapter = createFcmAdapter({
    projectId: 'roya-raqamia',
    clientEmail: 'firebase-adminsdk@roya-raqamia.iam.gserviceaccount.com',
    privateKey,
    fetchImpl: fetchMock as unknown as typeof fetch,
    now,
  });
  return { adapter, fetchMock };
}

const tokenOk = () => jsonResponse(200, { access_token: 'access-1', expires_in: 3600 });

describe('createServiceAccountAssertion', () => {
  it('signs a verifiable RS256 JWT with the messaging scope', () => {
    const jwt = createServiceAccountAssertion({
      clientEmail: 'sa@example.iam.gserviceaccount.com',
      privateKey,
      nowSeconds: 1_700_000_000,
    });

    const [header, claims, signature] = jwt.split('.');
    expect(JSON.parse(Buffer.from(header!, 'base64url').toString())).toEqual({
      alg: 'RS256',
      typ: 'JWT',
    });
    expect(JSON.parse(Buffer.from(claims!, 'base64url').toString())).toEqual({
      iss: 'sa@example.iam.gserviceaccount.com',
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: 1_700_000_000,
      exp: 1_700_003_600,
    });

    const verifier = createVerify('RSA-SHA256');
    verifier.update(`${header}.${claims}`);
    verifier.end();
    expect(verifier.verify(publicKey, Buffer.from(signature!, 'base64url'))).toBe(true);
  });
});

describe('createFcmAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('posts the message to the project endpoint with a bearer token', async () => {
    const { adapter, fetchMock } = makeAdapter((url) =>
      url.includes('oauth2.googleapis.com') ? tokenOk() : jsonResponse(200, { name: 'm/1' })
    );

    await adapter.send('device-token-1', payload);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [sendUrl, sendInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(sendUrl).toBe('https://fcm.googleapis.com/v1/projects/roya-raqamia/messages:send');
    expect((sendInit.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
    expect(JSON.parse(sendInit.body as string)).toEqual({
      message: {
        token: 'device-token-1',
        notification: { title: 'شهادة جديدة', body: 'نص' },
        data: { url: '/verify/COMP-1', type: 'certificate_issued', notificationId: 'n-1' },
        android: { priority: 'high', notification: { channel_id: FCM_CHANNEL_ID } },
      },
    });
  });

  it('exchanges the service account for a token with the jwt-bearer grant', async () => {
    const { adapter, fetchMock } = makeAdapter((url) =>
      url.includes('oauth2.googleapis.com') ? tokenOk() : jsonResponse(200, {})
    );

    await adapter.send('t', payload);

    const [tokenUrl, tokenInit] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(tokenUrl).toBe('https://oauth2.googleapis.com/token');
    const body = new URLSearchParams(tokenInit.body as string);
    expect(body.get('grant_type')).toBe('urn:ietf:params:oauth:grant-type:jwt-bearer');
    expect(body.get('assertion')?.split('.')).toHaveLength(3);
  });

  it('omits the body and defaults the tap target when the payload has neither', async () => {
    const { adapter, fetchMock } = makeAdapter((url) =>
      url.includes('oauth2.googleapis.com') ? tokenOk() : jsonResponse(200, {})
    );

    await adapter.send('t', { title: 'عنوان' });

    const [, sendInit] = fetchMock.mock.calls[1] as unknown as [string, RequestInit];
    expect(JSON.parse(sendInit.body as string).message).toEqual({
      token: 't',
      notification: { title: 'عنوان' },
      data: { url: '/' },
      android: { priority: 'high', notification: { channel_id: 'default' } },
    });
  });

  it('reuses the cached access token across sends', async () => {
    const { adapter, fetchMock } = makeAdapter((url) =>
      url.includes('oauth2.googleapis.com') ? tokenOk() : jsonResponse(200, {})
    );

    await adapter.send('t-1', payload);
    await adapter.send('t-2', payload);

    const tokenCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes('oauth2.googleapis.com')
    );
    expect(tokenCalls).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('re-authenticates once the cached token is inside the refresh skew', async () => {
    let clock = 1_700_000_000_000;
    const { adapter, fetchMock } = makeAdapter(
      (url) => (url.includes('oauth2.googleapis.com') ? tokenOk() : jsonResponse(200, {})),
      () => clock
    );

    await adapter.send('t-1', payload);
    // expires_in 3600s with a 60s skew: still valid at +3500s, stale at +3600s.
    clock += 3_500_000;
    await adapter.send('t-2', payload);
    clock += 200_000;
    await adapter.send('t-3', payload);

    const tokenCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes('oauth2.googleapis.com')
    );
    expect(tokenCalls).toHaveLength(2);
  });

  it('drops the cached token when FCM rejects it with 401', async () => {
    const { adapter, fetchMock } = makeAdapter((url) =>
      url.includes('oauth2.googleapis.com')
        ? tokenOk()
        : jsonResponse(401, { error: { status: 'UNAUTHENTICATED' } })
    );

    await expect(adapter.send('t', payload)).rejects.toThrow();
    await expect(adapter.send('t', payload)).rejects.toThrow();

    const tokenCalls = fetchMock.mock.calls.filter((call) =>
      String(call[0]).includes('oauth2.googleapis.com')
    );
    expect(tokenCalls).toHaveLength(2);
  });

  it('throws when the service account cannot mint a token', async () => {
    const { adapter } = makeAdapter(() => jsonResponse(400, { error: 'invalid_grant' }));

    await expect(adapter.send('t', payload)).rejects.toThrow(/FCM send failed \(400\)/);
  });

  it('maps an UNREGISTERED token to a prunable error', async () => {
    const { adapter } = makeAdapter((url) =>
      url.includes('oauth2.googleapis.com')
        ? tokenOk()
        : jsonResponse(404, {
            error: {
              status: 'NOT_FOUND',
              details: [
                {
                  '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError',
                  errorCode: 'UNREGISTERED',
                },
              ],
            },
          })
    );

    let caught: unknown;
    try {
      await adapter.send('t', payload);
    } catch (error) {
      caught = error;
    }

    expect((caught as FcmSendError).statusCode).toBe(404);
    expect((caught as FcmSendError).errorCode).toBe('UNREGISTERED');
    expect(isDeadTokenError(caught)).toBe(true);
  });

  it('falls back to the error status when FCM sends no error code', async () => {
    const { adapter } = makeAdapter((url) =>
      url.includes('oauth2.googleapis.com')
        ? tokenOk()
        : jsonResponse(403, { error: { status: 'SENDER_ID_MISMATCH' } })
    );

    let caught: unknown;
    try {
      await adapter.send('t', payload);
    } catch (error) {
      caught = error;
    }

    expect((caught as FcmSendError).errorCode).toBe('SENDER_ID_MISMATCH');
    expect(isDeadTokenError(caught)).toBe(true);
  });

  it('does NOT treat INVALID_ARGUMENT as a dead token', async () => {
    const { adapter } = makeAdapter((url) =>
      url.includes('oauth2.googleapis.com')
        ? tokenOk()
        : jsonResponse(400, {
            error: { status: 'INVALID_ARGUMENT', details: [{ errorCode: 'INVALID_ARGUMENT' }] },
          })
    );

    let caught: unknown;
    try {
      await adapter.send('t', payload);
    } catch (error) {
      caught = error;
    }

    expect((caught as FcmSendError).statusCode).toBe(400);
    expect(isDeadTokenError(caught)).toBe(false);
  });

  it('prunes when INVALID_ARGUMENT names the token as the offending field', async () => {
    // Verbatim shape from the live API (a bogus token), which is why the rule
    // is narrower than "400 means dead": the field violation is what tells a
    // broken token apart from a broken message.
    const { adapter } = makeAdapter((url) =>
      url.includes('oauth2.googleapis.com')
        ? tokenOk()
        : jsonResponse(400, {
            error: {
              code: 400,
              message: 'The registration token is not a valid FCM registration token',
              status: 'INVALID_ARGUMENT',
              details: [
                {
                  '@type': 'type.googleapis.com/google.firebase.fcm.v1.FcmError',
                  errorCode: 'INVALID_ARGUMENT',
                },
                {
                  '@type': 'type.googleapis.com/google.rpc.BadRequest',
                  fieldViolations: [
                    {
                      field: 'message.token',
                      description: 'The registration token is not a valid FCM registration token',
                    },
                  ],
                },
              ],
            },
          })
    );

    let caught: unknown;
    try {
      await adapter.send('t', payload);
    } catch (error) {
      caught = error;
    }

    expect((caught as FcmSendError).invalidToken).toBe(true);
    expect(isDeadTokenError(caught)).toBe(true);
  });

  it('does not prune when INVALID_ARGUMENT names another field', async () => {
    const { adapter } = makeAdapter((url) =>
      url.includes('oauth2.googleapis.com')
        ? tokenOk()
        : jsonResponse(400, {
            error: {
              status: 'INVALID_ARGUMENT',
              details: [
                { errorCode: 'INVALID_ARGUMENT' },
                { fieldViolations: [{ field: 'message.notification.title' }] },
              ],
            },
          })
    );

    let caught: unknown;
    try {
      await adapter.send('t', payload);
    } catch (error) {
      caught = error;
    }

    expect((caught as FcmSendError).invalidToken).toBe(false);
    expect(isDeadTokenError(caught)).toBe(false);
  });
});
