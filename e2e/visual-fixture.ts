import { createClient } from '@supabase/supabase-js';
import type { BrowserContext } from '@playwright/test';

import { signIn, type SignInCredentials } from './sign-in';

/**
 * The visual gate records against its own account (#920).
 *
 * The gate used to sign in as `E2E_TEST_EMAIL`, the account the offline suite
 * writes to: `product-offline-render` and `linksnap-offline` create and delete
 * links on it, so the rows behind a recording were whatever the last spec left.
 * A gated state that reads the account - the owned LinkSnap rows (#941) and the
 * analytics drawer (#962) - then recorded a different account every run, and a
 * baseline nobody can re-record is not evidence (ADR-0119).
 *
 * `E2E_VISUAL_EMAIL` / `E2E_VISUAL_PASSWORD` name an ordinary confirmed account
 * that only this capture writes to. `node e2e/setup-test-user.ts --visual`
 * provisions it, and `npm run visual:capture` runs that before the browser.
 *
 * The fixtures below are the account's rows, not an absence of rows: one fixed
 * link at a fixed destination, a fixed number of clicks delivered through the
 * real redirect, and both removed after the recording. The fixed codes are also
 * what make the click count exact - a previous run's events are hard-deleted
 * before the link is recreated, because the dashboard's own delete is a
 * tombstone that keeps its click history.
 */

export const VISUAL_EMAIL_VARIABLE = 'E2E_VISUAL_EMAIL';
export const VISUAL_PASSWORD_VARIABLE = 'E2E_VISUAL_PASSWORD';

/** What the capture says when it has no account to record with. */
export const VISUAL_ACCOUNT_MISSING = `${VISUAL_EMAIL_VARIABLE} and ${VISUAL_PASSWORD_VARIABLE} name the visual gate's own fixture account; without them the capture records nothing rather than the shared offline account (#920)`;

export type VisualCredentials = SignInCredentials;
/** The visual account, or null when the pair is absent rather than guessed at. */
export function visualCredentials(): VisualCredentials | null {
  const email = process.env[VISUAL_EMAIL_VARIABLE];
  const password = process.env[VISUAL_PASSWORD_VARIABLE];
  return email && password ? { email, password } : null;
}

export async function signInAsVisualAccount(
  context: BrowserContext,
  baseURL: string
): Promise<void> {
  const credentials = visualCredentials();
  if (!credentials) throw new Error(VISUAL_ACCOUNT_MISSING);
  await signIn(context, baseURL, credentials);
}

export interface VisualLinkFixture {
  code: string;
  destination: string;
  clicks: number;
}

/**
 * One link, one destination, three clicks. The number is the fixture's, so the
 * analytics it feeds is a recording and not today's traffic.
 */
export const VISUAL_LINK: VisualLinkFixture = {
  code: 'e2e-visual-gate',
  destination: 'https://example.com/visual-gate',
  clicks: 3,
};

/** How long the deferred click writes get to appear in the analytics read. */
const CLICK_SETTLE_MS = 30_000;

/** The feed the community state seeds, and the prefix the cleanup matches. */
export const COMMUNITY_SEED_PREFIX = 'e2e-visual-community-';

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to remove the visual gate fixtures');
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

/** The signed-in member's id, read through the session the capture itself set. */
async function sessionUserId(context: BrowserContext, baseURL: string): Promise<string> {
  const response = await context.request.get(`${baseURL}/auth/api/session`);
  const body = (await response.json().catch(() => ({}))) as { userId?: unknown };
  if (!response.ok() || typeof body.userId !== 'string') {
    throw new Error(`the visual account has no session (${response.status()})`);
  }
  return body.userId;
}

/**
 * Removes the fixture link and, with it, its clicks: `analytics_events` cascades
 * on the row's delete. A hard delete is deliberate - the dashboard's own delete
 * is a tombstone, and a tombstoned code cannot be created again.
 */
export async function clearVisualLink(context: BrowserContext, baseURL: string): Promise<void> {
  const userId = await sessionUserId(context, baseURL);
  const { error } = await serviceClient()
    .from('short_links')
    .delete()
    .eq('user_id', userId)
    .eq('code', VISUAL_LINK.code);
  if (error) {
    throw new Error(`could not remove the visual gate fixture link: ${error.message}`);
  }
}

/**
 * Creates the fixed link through the page's own route, clicks it the fixed
 * number of times through the real redirect, then waits for the deferred click
 * writes to land. It returns only when the analytics read is the fixture's
 * count, so a state recorded next sees a settled account.
 */
export async function seedVisualLink(
  context: BrowserContext,
  baseURL: string
): Promise<VisualLinkFixture> {
  await clearVisualLink(context, baseURL);

  const created = await context.request.post(`${baseURL}/linksnap/api/shorten`, {
    data: { originalUrl: VISUAL_LINK.destination, customCode: VISUAL_LINK.code },
    headers: { 'Content-Type': 'application/json' },
  });
  if (!created.ok()) {
    throw new Error(
      `could not create the visual gate fixture link (${created.status()}): ${await created.text()}`
    );
  }

  for (let click = 0; click < VISUAL_LINK.clicks; click += 1) {
    const response = await context.request.get(`${baseURL}/${VISUAL_LINK.code}`, {
      maxRedirects: 0,
    });
    // 3xx is the hit: following it would fetch the destination instead.
    if (response.status() < 300 || response.status() >= 400) {
      throw new Error(
        `the visual gate fixture click ${click + 1} did not redirect (${response.status()})`
      );
    }
  }

  const deadline = Date.now() + CLICK_SETTLE_MS;
  for (;;) {
    const response = await context.request.get(
      `${baseURL}/linksnap/api/analytics/${VISUAL_LINK.code}`
    );
    const body = (await response.json().catch(() => ({}))) as {
      analytics?: { totalClicks?: unknown };
    };
    if (!response.ok()) {
      throw new Error(
        `could not read the visual gate fixture analytics (${response.status()}): ${JSON.stringify(body)}`
      );
    }

    const total = body.analytics?.totalClicks;
    if (total === VISUAL_LINK.clicks) return VISUAL_LINK;
    if (Date.now() > deadline) {
      throw new Error(
        `the visual gate fixture recorded ${String(total)} clicks, expected ${VISUAL_LINK.clicks}`
      );
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
}

/**
 * Removes the community rows this capture seeds, tombstones included.
 *
 * The page's own delete is a tombstone, and `posts.slug` is unique across the
 * table, so a fixed seed slug could never be written a second time. A hard
 * delete keyed to the account and the seed prefix is what makes the same slugs
 * reusable and leaves nothing behind when the recording fails.
 */
export async function clearVisualCommunityPosts(
  context: BrowserContext,
  baseURL: string
): Promise<void> {
  const userId = await sessionUserId(context, baseURL);
  const { error } = await serviceClient()
    .from('posts')
    .delete()
    .eq('author_id', userId)
    .like('slug', `${COMMUNITY_SEED_PREFIX}%`);
  if (error) {
    throw new Error(`could not remove the visual gate community seeds: ${error.message}`);
  }
}
