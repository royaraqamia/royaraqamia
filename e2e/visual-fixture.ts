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

/**
 * The apps the gate's homepage fixture keeps (#1194).
 *
 * The recording has to be the same every run, and the homepage's strip is the
 * member's own order: an account that kept something from a previous capture
 * would change the pills and the strip's pixels. `/quran` first so the selected
 * pill is the same one every time.
 */
export const VISUAL_HOME_SERVICES = ['/quran', '/rates'] as const;

/** Replaces the account's homepage apps through the page's own route. */
export async function seedHomeServices(
  context: BrowserContext,
  baseURL: string,
  services: readonly string[]
): Promise<void> {
  const response = await context.request.put(`${baseURL}/api/me/home-services`, {
    data: { services },
    // The member write is origin-guarded (`isSameOrigin`); the request has to
    // look like the page's own fetch rather than an anonymous client.
    headers: {
      'Content-Type': 'application/json',
      Origin: baseURL,
      'Sec-Fetch-Site': 'same-origin',
    },
  });
  if (!response.ok()) {
    throw new Error(
      `the homepage fixture was refused (${response.status()}): ${await response.text()}`
    );
  }
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

/**
 * The digest the news recording reads (#1345).
 *
 * The page's day is pinned to this fixed date (`?date=`), so the card the gate
 * measures is the same every run instead of whatever the nightly workflow
 * published this morning (ADR-0119). The story carries no `sourcePublishedAt`,
 * because the page draws that as a relative sentence and a clock in the raster
 * would make the recording differ by the hour it was taken.
 */
export const VISUAL_NEWS = {
  digestId: 'e2e00000-0000-4000-8000-00000000e134',
  storyId: 'e2e00000-0000-4000-8000-00000000e135',
  date: '2026-01-15',
  title: 'ملخّص تجريبي للبوابة',
  lede: 'مقدّمة تجريبية للبوابة.',
  model: 'e2e-visual-gate',
  category: 'tech',
  region: 'arab',
  headline: 'خبر تجريبي لبوابة القياس',
  summary: 'ملخّص الخبر التجريبي الذي تقيسه البوابة على الشاشتين.',
  sourceId: 'e2e-visual-news',
  sourceName: 'مصدر تجريبي',
  sourceUrl: 'https://example.com/e2e-visual-news',
} as const;

/** Removes the news digest and its stories. */
export async function clearVisualNews(): Promise<void> {
  const { error } = await serviceClient()
    .from('news_digests')
    .delete()
    .eq('id', VISUAL_NEWS.digestId);
  if (error) {
    throw new Error(`could not remove the visual gate news fixture: ${error.message}`);
  }
}

/**
 * Writes the fixed digest and its one story through the service role.
 *
 * The digest is the workflow's own row shape, so the page reads it like any
 * published day rather than through a test-only path. The fixed id is deleted
 * first: `digest_date` is unique, and a failed recording must not leave a row a
 * later run cannot write.
 */
export async function seedVisualNews(): Promise<void> {
  await clearVisualNews();
  const client = serviceClient();

  const { error: digestError } = await client.from('news_digests').insert({
    id: VISUAL_NEWS.digestId,
    digest_date: VISUAL_NEWS.date,
    title: VISUAL_NEWS.title,
    lede: VISUAL_NEWS.lede,
    story_count: 1,
    model: VISUAL_NEWS.model,
    run_url: null,
    published_at: `${VISUAL_NEWS.date}T06:00:00.000Z`,
  });
  if (digestError) {
    throw new Error(`could not seed the visual gate news digest: ${digestError.message}`);
  }

  const { error: storyError } = await client.from('news_stories').insert({
    id: VISUAL_NEWS.storyId,
    digest_id: VISUAL_NEWS.digestId,
    position: 1,
    category: VISUAL_NEWS.category,
    region: VISUAL_NEWS.region,
    headline_ar: VISUAL_NEWS.headline,
    summary_ar: VISUAL_NEWS.summary,
    why_it_matters_ar: null,
    source_id: VISUAL_NEWS.sourceId,
    source_name: VISUAL_NEWS.sourceName,
    source_url: VISUAL_NEWS.sourceUrl,
    source_published_at: null,
  });
  if (storyError) {
    throw new Error(`could not seed the visual gate news story: ${storyError.message}`);
  }
}

/**
 * The marketplace fixture (#1256).
 *
 * The store draws the curated catalogue, which is the daily sync's data rather
 * than the gate's, and the detail screen draws a connection. A recording that
 * depends on whatever the sync published today is not evidence (ADR-0119), so a
 * fixed row is written through the service role and a fixed connection is
 * written on top of it. The catalogue admission rule is the API's, not this
 * file's: the row is `active`, `verified_at` is set and `connectable` is true,
 * which are the three columns `listCatalogServers` filters on.
 *
 * The gate account's own connections are removed first so the store's
 * "connected" panel and the detail screen cannot pick up a grant a previous
 * session left behind. That account is the gate's own (#920), never the shared
 * offline one.
 */
export const VISUAL_MCP = {
  registryName: 'e2e-visualgate.example/mcp',
  /** The store's own search term: it matches the fixed row and nothing else. */
  term: 'e2e-visualgate',
  title: 'Visualgate',
  description: 'A fixed row the visual gate seeds for one recording.',
  connectionId: '00000000-0000-4000-8000-00000000e2e1',
  connectionName: 'Visualgate',
  toolName: 'visualgate_search',
  toolDescription: 'Searches the fixed row.',
} as const;

/** The fixture row's address: its registry key's host, as the sync stores one. */
const VISUAL_MCP_REMOTE = `https://${VISUAL_MCP.registryName.split('/')[0]}/mcp`;
const VISUAL_MCP_AT = '2026-01-01T00:00:00.000Z';

/** Removes the fixture row and every connection the gate account owns. */
export async function clearVisualMcp(context: BrowserContext, baseURL: string): Promise<void> {
  const userId = await sessionUserId(context, baseURL);
  const client = serviceClient();

  // The connection first: it references the catalogue row with `on delete
  // restrict`, and its tools and credentials cascade from it.
  const connections = await client.from('mcp_connections').delete().eq('user_id', userId);
  if (connections.error) {
    throw new Error(
      `could not remove the visual gate MCP connections: ${connections.error.message}`
    );
  }

  const catalog = await client
    .from('mcp_catalog_servers')
    .delete()
    .eq('registry_name', VISUAL_MCP.registryName);
  if (catalog.error) {
    throw new Error(`could not remove the visual gate MCP row: ${catalog.error.message}`);
  }
}

/**
 * Writes the fixed catalogue row, and — when the state draws one — the fixed
 * connection and its one tool.
 *
 * The row has no icon on purpose: a third-party mark would make the recording
 * depend on that site answering, and the page's monogram is the fallback both
 * clients must draw anyway.
 */
export async function seedVisualMcp(
  context: BrowserContext,
  baseURL: string,
  { connection = false }: { connection?: boolean } = {}
): Promise<string | null> {
  await clearVisualMcp(context, baseURL);
  const userId = await sessionUserId(context, baseURL);
  const client = serviceClient();

  const catalog = await client.from('mcp_catalog_servers').insert({
    registry_name: VISUAL_MCP.registryName,
    title: VISUAL_MCP.title,
    description: VISUAL_MCP.description,
    remote_url: VISUAL_MCP_REMOTE,
    status: 'active',
    auth_mode: 'oauth',
    verified_at: VISUAL_MCP_AT,
    connectable: true,
    // A verdict without a time is refused by the table's own check: the row's
    // connectable answer is the probe's, so the probe's stamp goes with it.
    probed_at: VISUAL_MCP_AT,
    featured_rank: 1,
  });
  if (catalog.error) {
    throw new Error(`could not seed the visual gate MCP row: ${catalog.error.message}`);
  }

  if (!connection) return null;

  const row = await client.from('mcp_connections').insert({
    id: VISUAL_MCP.connectionId,
    user_id: userId,
    registry_name: VISUAL_MCP.registryName,
    server_url: VISUAL_MCP_REMOTE,
    display_name: VISUAL_MCP.connectionName,
    enabled: true,
    permission_level: 'reads',
    status: 'active',
    tool_count: 1,
    connected_at: VISUAL_MCP_AT,
    last_synced_at: VISUAL_MCP_AT,
  });
  if (row.error) {
    throw new Error(`could not seed the visual gate MCP connection: ${row.error.message}`);
  }

  const tool = await client.from('mcp_connection_tools').insert({
    connection_id: VISUAL_MCP.connectionId,
    tool_name: VISUAL_MCP.toolName,
    description: VISUAL_MCP.toolDescription,
    read_only: true,
    enabled: true,
    last_seen_at: VISUAL_MCP_AT,
  });
  if (tool.error) {
    throw new Error(`could not seed the visual gate MCP tool: ${tool.error.message}`);
  }

  return VISUAL_MCP.connectionId;
}

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
 * Marks the fixture link protected (#941).
 *
 * The account-links row draws a protected pill only for a link that carries a
 * password, and the fixture link is clicked through the real redirect to settle
 * its analytics — which a protected link would answer with the unlock page. So
 * the password is written after the clicks: the row then has the pill, and the
 * click history the analytics state reads is unchanged. The hash is a marker,
 * not a password anyone unlocks with; the capture never opens the link again.
 */
export async function protectVisualLink(context: BrowserContext, baseURL: string): Promise<void> {
  const userId = await sessionUserId(context, baseURL);
  const { error } = await serviceClient()
    .from('short_links')
    .update({ password_hash: 'scrypt:e2e-visual-gate:marker' })
    .eq('user_id', userId)
    .eq('code', VISUAL_LINK.code);
  if (error) {
    throw new Error(`could not protect the visual gate fixture link: ${error.message}`);
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

/**
 * The profile the gate records (#1343).
 *
 * A hidden member answers 404 through `loadCommunityMember` (ADR-0127), so the
 * fixture account is made visible for the recording and hidden again after it.
 * The bio and the one published post are the fixture's, not the account's: a
 * recording that depended on whatever a previous run left is not evidence
 * (ADR-0119).
 */
export const VISUAL_PROFILE = {
  username: 'e2e-visual-user',
  name: 'E2E Visual User',
  bio: 'نبذة تعريفية للبوابة.',
  slug: 'e2e-visual-profile-post',
  content: 'منشور تجريبي لصفحة العضو',
} as const;

/** The prefix the profile cleanup matches, so it cannot touch a real post. */
export const PROFILE_SEED_PREFIX = 'e2e-visual-profile-';

/**
 * Makes the fixture member visible with its one fixed post.
 *
 * The row is unhidden through the service role because the public loader refuses
 * a hidden member; the post is written through the page's own route so its author
 * and lifecycle are the product's, not a row poked from the outside. The fixed
 * slug is hard-deleted first, because a previous run's tombstone keeps the unique
 * slug taken.
 */
export async function seedVisualProfile(context: BrowserContext, baseURL: string): Promise<void> {
  const userId = await sessionUserId(context, baseURL);
  await clearVisualProfile(context, baseURL);

  const { error } = await serviceClient()
    .from('users')
    .update({ is_hidden: false, bio: VISUAL_PROFILE.bio })
    .eq('id', userId);
  if (error) {
    throw new Error(`could not make the visual profile visible: ${error.message}`);
  }

  const response = await context.request.post(`${baseURL}/api/community/posts`, {
    data: { slug: VISUAL_PROFILE.slug, content: VISUAL_PROFILE.content, status: 'published' },
    headers: { 'Content-Type': 'application/json' },
  });
  if (!response.ok()) {
    throw new Error(
      `the profile fixture post was refused (${response.status()}): ${await response.text()}`
    );
  }
}

/**
 * Removes the profile fixture and hides the account again.
 *
 * Hiding matters even when the recording failed: the row is a real verified
 * member, and every public listing would name it until the next bootstrap
 * (ADR-0127). The post is a hard delete for the same reason as the community
 * seeds: the page's own delete is a tombstone that keeps the slug.
 */
export async function clearVisualProfile(context: BrowserContext, baseURL: string): Promise<void> {
  const userId = await sessionUserId(context, baseURL);
  const { error } = await serviceClient()
    .from('posts')
    .delete()
    .eq('author_id', userId)
    .like('slug', `${PROFILE_SEED_PREFIX}%`);
  if (error) {
    throw new Error(`could not remove the visual profile fixture: ${error.message}`);
  }

  const { error: hideError } = await serviceClient()
    .from('users')
    .update({ is_hidden: true, bio: null })
    .eq('id', userId);
  if (hideError) {
    throw new Error(`could not hide the visual profile again: ${hideError.message}`);
  }
}
