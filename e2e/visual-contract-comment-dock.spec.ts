import { test, expect, type Page } from '@playwright/test';

import {
  clearVisualPost,
  seedVisualPost,
  signInAsVisualAccount,
  visualCredentials,
  VISUAL_ACCOUNT_MISSING,
  type VisualPostFixture,
} from './visual-fixture';

/**
 * Geometry regression for the post's pinned comment dock (#1611).
 *
 * The dock is `fixed` on a secondary route, where no bottom tab bar lifts the
 * corner floats, so the assistant door used to land on the field's inline-start
 * and steal taps from the placeholder. This lives in the visual-gate project
 * because the measurement is the gate's viewport: 393 x 852 CSS px at DPR 2.75,
 * dark, Arabic, RTL. It seeds its own post under its own prefix so it cannot
 * delete the capture's post when both specs run in the same browser session.
 */

const DOCK_POST: VisualPostFixture = {
  slug: 'e2e-dock-overlap-post',
  content: '## تعليق تجريبي\n\nنص قصير لقياس موضع زر المساعد بجوار حقل التعليق.',
  cover: '/01.webp',
  tag: { name: 'تجريبي', slug: 'e2e-dock-overlap-tag' },
  prefix: 'e2e-dock-overlap-post',
  tagPrefix: 'e2e-dock-overlap-tag',
};

const DOCK = '[data-visual="community-comment-dock"]';
/** The comment field is a Tiptap editor, not a `textarea` element. */
const FIELD = `${DOCK} [role="textbox"]`;
/**
 * The row now holds two buttons — the field's own emoji sheet and the send slot
 * — so the selector names the send rather than taking the first button the dock
 * happens to draw.
 */
const SEND = `${DOCK} [data-visual="community-comment-send"]`;
const LAUNCHER = '[data-assistant-launcher]';

interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface Geometry {
  launcher: Box | null;
  field: Box | null;
  dock: Box | null;
  send: Box | null;
  overlapX: number;
  overlapY: number;
  overlapSendX: number;
  overlapSendY: number;
  bottomGap: number | null;
  hasTabBar: boolean;
  fieldPoints: Array<{ dx: number; inside: boolean; launcher: boolean; tag: string | null }>;
  sendHit: { inside: boolean; launcher: boolean; tag: string | null } | null;
}

async function geometry(page: Page): Promise<Geometry> {
  return page.evaluate(
    ({ dockSelector, fieldSelector, sendSelector, launcherSelector }) => {
      const box = (node: Element | null): Box | null => {
        if (!node) return null;
        const rect = node.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      };
      const launcher = document.querySelector(launcherSelector);
      const dock = document.querySelector(dockSelector);
      const field = dock?.querySelector(fieldSelector) ?? null;
      const send = dock?.querySelector(sendSelector) ?? null;
      const launcherBox = box(launcher);
      const fieldBox = box(field);
      const hit = (node: Element | null, x: number, y: number) => {
        const target = document.elementFromPoint(x, y);
        return {
          inside: !!node && !!target && (target === node || node.contains(target)),
          launcher: !!target?.closest(launcherSelector),
          tag: target?.tagName ?? null,
        };
      };
      const overlap = (a: Box | null, b: Box | null): [number, number] => {
        if (!a || !b) return [0, 0];
        return [
          Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x)),
          Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y)),
        ];
      };
      const [overlapX, overlapY] = overlap(launcherBox, fieldBox);
      const sendBox = box(send);
      const [overlapSendX, overlapSendY] = overlap(launcherBox, sendBox);

      return {
        launcher: launcherBox,
        field: fieldBox,
        dock: box(dock),
        send: sendBox,
        overlapX,
        overlapY,
        overlapSendX,
        overlapSendY,
        bottomGap: launcherBox ? window.innerHeight - (launcherBox.y + launcherBox.height) : null,
        hasTabBar: !!document.querySelector('[data-bottom-tabbar]'),
        fieldPoints: fieldBox
          ? [
              // The field's own emoji control sits inside its start edge — the
              // same corner the launcher used to steal — so the start sample
              // lands clear of it and the three points still prove the editor
              // answers across the row.
              4,
              fieldBox.width / 2,
              fieldBox.width - 44,
            ].map((dx) => ({
              dx,
              ...hit(field, fieldBox.x + dx, fieldBox.y + fieldBox.height / 2),
            }))
          : [],
        sendHit: sendBox
          ? hit(send, sendBox.x + sendBox.width / 2, sendBox.y + sendBox.height / 2)
          : null,
      };
    },
    { dockSelector: DOCK, fieldSelector: FIELD, sendSelector: SEND, launcherSelector: LAUNCHER }
  );
}

/**
 * The development indicator is chrome, not product (the visual gate hides it
 * too). Its bottom-left pill sits on the send button in a dev-server run; a
 * production build does not draw it at all.
 */
async function hideDevIndicator(page: Page): Promise<void> {
  await page.addStyleTag({ content: 'nextjs-portal { display: none !important; }' });
}

function expectClear(g: Geometry): void {
  expect(g.launcher, 'the assistant door is on every screen (ADR-0143)').not.toBeNull();
  expect(g.field, 'the dock has a comment field').not.toBeNull();
  expect(g.overlapX * g.overlapY, 'launcher and field share no pixel').toBe(0);
  expect(g.send, 'the dock has a send slot').not.toBeNull();
  expect(g.overlapSendX * g.overlapSendY, 'launcher and send button share no pixel').toBe(0);
  for (const point of g.fieldPoints) {
    expect(point.inside, `the field answers at +${point.dx}px`).toBe(true);
    expect(point.launcher, `the launcher is not hit at +${point.dx}px`).toBe(false);
  }
}

function projectBaseURL(testInfo: { project: { use: { baseURL?: string } } }): string {
  return testInfo.project.use.baseURL ?? 'http://localhost:3000';
}

test.describe.configure({ mode: 'serial' });

test.describe('the comment dock clears the assistant launcher', () => {
  const credentials = visualCredentials();
  if (!credentials) console.log(VISUAL_ACCOUNT_MISSING);
  test.skip(!credentials, VISUAL_ACCOUNT_MISSING);

  let postUrl = '';

  test.beforeAll(async ({ browser }, testInfo) => {
    const baseURL = projectBaseURL(testInfo);
    const context = await browser.newContext({ baseURL });
    try {
      await signInAsVisualAccount(context, baseURL);
      await seedVisualPost(context, baseURL, DOCK_POST);
      postUrl = new URL(`/community/${DOCK_POST.slug}`, baseURL).toString();
    } finally {
      await context.close();
    }
  });

  test.afterAll(async ({ browser }, testInfo) => {
    // Only a seeded post has a cleanup: a failed sign-in must not mask its own
    // error with a second one from a session the seed never got.
    if (!postUrl) return;
    const baseURL = projectBaseURL(testInfo);
    const context = await browser.newContext({ baseURL });
    try {
      await signInAsVisualAccount(context, baseURL);
      await clearVisualPost(context, baseURL, DOCK_POST);
    } finally {
      await context.close();
    }
  });

  test('a signed-in member can reach every part of the field', async ({ page }) => {
    const baseURL = projectBaseURL(test.info());
    await signInAsVisualAccount(page.context(), baseURL);
    await page.goto(postUrl, { waitUntil: 'domcontentloaded' });
    await hideDevIndicator(page);
    await page.locator(FIELD).waitFor({ timeout: 20_000 });
    await page.locator(LAUNCHER).waitFor();
    await page.evaluate(() => document.fonts.ready);

    const rest = await geometry(page);
    expect(rest.dock).not.toBeNull();
    expectClear(rest);

    // Typed text lives at the inline-start too; it must stay tappable once the
    // field is filled, not only while the placeholder is showing.
    await page.locator(FIELD).click();
    await page.keyboard.type('تعليق');
    expect(await page.locator(FIELD).innerText()).toContain('تعليق');
    const typed = await geometry(page);
    expectClear(typed);
    // The empty draft's send button is `pointer-events-none`; with text it is a
    // real target, so hit-test it too.
    expect(typed.sendHit?.inside ?? false, 'the enabled send button is tappable').toBe(true);
  });

  test('a guest can reach every part of the field', async ({ page }) => {
    await page.goto(postUrl, { waitUntil: 'domcontentloaded' });
    await hideDevIndicator(page);
    await page.locator(FIELD).waitFor({ timeout: 20_000 });
    await page.locator(LAUNCHER).waitFor();
    await page.evaluate(() => document.fonts.ready);

    const g = await geometry(page);
    expect(g.dock).not.toBeNull();
    expectClear(g);
  });

  test('routes without the dock keep the launcher where it rests', async ({ page }) => {
    const baseURL = projectBaseURL(test.info());
    for (const route of ['/', '/community']) {
      await page.goto(new URL(route, baseURL).toString(), { waitUntil: 'domcontentloaded' });
      await hideDevIndicator(page);
      await page.locator(LAUNCHER).waitFor();
      const g = await geometry(page);
      expect(g.dock, `${route} has no comment dock`).toBeNull();
      // Whichever chrome the route wears, neither has the dock's lift: the tab
      // bar rests the floats at 68px, a barless secondary route at 16px, and a
      // leaked dock rule would put the launcher at 81px.
      expect(g.bottomGap, `${route} launcher gap`).toBe(g.hasTabBar ? 68 : 16);
    }
  });
});
