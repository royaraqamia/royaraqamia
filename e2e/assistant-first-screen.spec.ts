import { randomUUID } from 'node:crypto';

import { expect, test } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';

import { signIn } from './sign-in';

/**
 * Gate for #1859: a signed-in member meets an opening on the 393 x 852 screen,
 * not a blank thread. Three measurements, in the order the product makes them:
 *
 * 1. the actions on screen are the ones the endpoint projected from the tool
 *    registry, and there are at least two of them;
 * 2. opening the sheet writes no `chat_conversations` row — the first message
 *    mints the thread, so an abandoned open leaves nothing behind;
 * 3. the two `usage_events` keys exist, so the reversal trigger in the issue can
 *    actually be measured.
 *
 * A fresh fixture account per run keeps the "empty thread" precondition real
 * without touching any member's history. The account is a `@royaraqamia.test`
 * fixture, so its turns are excluded from product metrics by construction.
 */
test.use({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2.75,
  colorScheme: 'dark',
  locale: 'ar',
});

test('the assistant opens with registry actions and no conversation row', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(180_000);
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );

  const email = `assistant-opening-${randomUUID()}@royaraqamia.test`;
  const password = `${randomUUID()}Aa1!`;
  const created = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(created.error, created.error?.message).toBeNull();
  const userId = created.data.user!.id;

  const profile = await supabase.from('users').insert({
    id: userId,
    email,
    name: 'Assistant Opening Fixture',
    created_at: new Date().toISOString(),
  });
  // The auth trigger writes public.users too; an existing row is the fixture,
  // not a failure.
  expect(profile.error && profile.error.code !== '23505' ? profile.error.message : null).toBeNull();

  const agentThreadCount = async (): Promise<number> => {
    const { count, error } = await supabase
      .from('chat_conversations')
      .select('id', { count: 'exact', head: true })
      .eq('created_by', userId)
      .eq('kind', 'agent');
    expect(error, error?.message).toBeNull();
    return count ?? 0;
  };

  const usageCount = async (actionKey: string): Promise<number> => {
    const { count, error } = await supabase
      .from('usage_events')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('action_key', actionKey);
    expect(error, error?.message).toBeNull();
    return count ?? 0;
  };

  try {
    await signIn(page.context(), baseURL!, { email, password });
    expect(await agentThreadCount()).toBe(0);

    await page.goto('/');
    // The panel's first-screen read is the first signed-in fetch the page makes;
    // let the session settle before opening so a cold dev server cannot answer
    // it with the guest's 401 while the cookie is still being applied.
    await expect
      .poll(async () => (await page.request.get(`${baseURL}/auth/api/session`)).ok())
      .toBe(true);
    await page.locator('[data-assistant-launcher]').click();

    const sheet = page.locator('[data-assistant-panel]');
    await expect(sheet).toBeVisible();
    const firstScreen = sheet.locator('[data-assistant-first-screen]');
    await expect(firstScreen).toBeVisible();

    const suggestions = firstScreen.locator('[data-assistant-suggestion]');
    await expect(suggestions.first()).toBeVisible();
    const advertised = await suggestions.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).dataset.toolId ?? '')
    );
    expect(advertised.length).toBeGreaterThanOrEqual(2);
    // At most three, and none of them about a product this fresh account has
    // never used: the opening is the member's state, not a fixed trio (#1918).
    expect(advertised.length).toBeLessThanOrEqual(3);
    expect(advertised).not.toContain('habitflow.get_habits_summary');

    // The row the questions share stays inside the 393 px panel: a question the
    // member cannot read in the sheet is not an opening.
    const panelBox = await sheet.boundingBox();
    expect(panelBox).not.toBeNull();
    const chipBoxes = await suggestions.evaluateAll((nodes) =>
      nodes.map((node) => {
        const box = node.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width };
      })
    );
    for (const box of chipBoxes) {
      expect(box.width).toBeGreaterThan(0);
      expect(box.left).toBeGreaterThanOrEqual(panelBox!.x - 0.5);
      expect(box.right).toBeLessThanOrEqual(panelBox!.x + panelBox!.width + 0.5);
    }

    // The endpoint's projection is the registry's own answer: an id on screen
    // that is absent here is a slogan nobody declared, which is the drift this
    // issue exists to prevent.
    const state = await page.request.get(`${baseURL}/api/chats/assistant?opening=1`);
    expect(state.ok()).toBe(true);
    const payload = (await state.json()) as {
      opening?: { suggestions: Array<{ toolId: string }> };
    };
    const registryIds = payload.opening?.suggestions.map((item) => item.toolId) ?? [];
    expect(registryIds.length).toBeGreaterThanOrEqual(2);
    for (const id of advertised) expect(registryIds).toContain(id);

    // Opening is a read. No thread exists until the member says something.
    expect(await agentThreadCount()).toBe(0);
    expect(await usageCount('assistant.first_screen.shown')).toBeGreaterThanOrEqual(1);

    // A suggestion is the first message: its tap sends the question and mints
    // the thread, which is the honest unit for every later turn metric. Wait for
    // the stream to finish before tearing the fixture down, or cleanup races
    // the turn's own writes.
    const turn = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        /\/api\/chats\/[^/]+\/assistant/.test(response.url())
    );
    await suggestions.first().click();
    await (await turn).finished();
    await expect.poll(agentThreadCount, { timeout: 30_000 }).toBe(1);
    await expect
      .poll(() => usageCount('assistant.first_screen.tap'), { timeout: 30_000 })
      .toBeGreaterThanOrEqual(1);
  } finally {
    const { data: threads } = await supabase
      .from('chat_conversations')
      .select('id')
      .eq('created_by', userId);
    const ids = (threads ?? []).map((row) => row.id as string);
    if (ids.length > 0) {
      await supabase.from('chat_messages').delete().in('conversation_id', ids);
      await supabase.from('chat_participants').delete().in('conversation_id', ids);
      await supabase.from('chat_conversations').delete().in('id', ids);
    }
    await supabase.from('usage_events').delete().eq('user_id', userId);
    await supabase.from('users').delete().eq('id', userId);
    await supabase.auth.admin.deleteUser(userId);
  }
});
