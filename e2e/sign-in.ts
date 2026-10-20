import { expect, type APIResponse, type BrowserContext } from '@playwright/test';

/**
 * Signs the shared E2E account in through the endpoint the login form posts to.
 *
 * Seven specs sign in against one account, and `login:${email}` allows five
 * attempts per 60 seconds (`backend/services/auth/auth-service.ts`). Serial
 * execution does not save us: the first five finish inside half a minute, so the
 * sixth used to come back as a 400 carrying the rate-limit message and read as a
 * broken product (#386). Every sign-in goes through here instead: paced to the
 * limiter's own window, and retried after the window rolls when an earlier test
 * — or a previous run against the same server — already spent it.
 *
 * The pace is best-effort: a fresh worker process starts with no history, which
 * is what the retry is for. Matching the product's own message (not the status
 * alone) keeps a wrong password from waiting a minute before failing.
 */
const RATE_LIMIT_MESSAGE = 'تم تجاوز الحد الأقصى لمحاولات الدخول. يرجى المحاولة بعد دقيقة';

const WINDOW_MS = 60_000;
const ATTEMPTS_PER_WINDOW = 5;
const PACE_MS = WINDOW_MS / ATTEMPTS_PER_WINDOW;
const MAX_TRIES = 3;

let lastAttemptAt = 0;

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function signIn(context: BrowserContext, baseURL: string): Promise<APIResponse> {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) {
    throw new Error('E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set to sign in');
  }

  for (let attempt = 1; ; attempt += 1) {
    const idle = Date.now() - lastAttemptAt;
    if (idle < PACE_MS) await wait(PACE_MS - idle);
    lastAttemptAt = Date.now();

    const response = await context.request.fetch(`${baseURL}/auth/api/login`, {
      method: 'POST',
      data: {
        email,
        password,
        redirectTo: null,
        turnstileToken: 'XXXX.DUMMY.TOKEN.XXXX',
      },
      headers: { 'Content-Type': 'application/json' },
    });
    if (response.ok()) return response;

    const body = await response.text();
    if (body.includes(RATE_LIMIT_MESSAGE) && attempt < MAX_TRIES) {
      await wait(WINDOW_MS);
      continue;
    }

    expect(response.ok(), `sign-in failed (${response.status()}): ${body}`).toBe(true);
    return response;
  }
}
