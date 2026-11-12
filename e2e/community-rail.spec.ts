import { test, expect, type Locator, type Page } from '@playwright/test';
import { signIn } from './sign-in';

/**
 * The members rail belongs beside the feed at `lg`, and it has to stay there
 * after the app has been used.
 *
 * Every surface compiles its own Tailwind stylesheet and Next appends a route's
 * sheet to the document when it is first visited (`app/surface.css`), so a sheet
 * loaded after `/community` outranks the community one on the utilities the two
 * share. The two columns are therefore written as two variants —
 * `max-lg:grid-cols-1 lg:grid-cols-[…]` — because a variant is only outranked by
 * another variant, while a bare `grid-cols-1` loses to any later surface that
 * compiles the same base class (ADR-0132). When it loses, `grid-template-columns`
 * folds to one column and the rail drops below a feed that is thousands of pixels
 * tall: not hidden, just not where the desktop layout put it.
 *
 * The navigation below is the whole point: a cold load is always correct, and so
 * is a phone (one column is the design there). Only the `/` → `/community` hop
 * after `/` has been drawn exposes the order.
 */

const RAIL = 'aside[aria-label="أعضاء المجتمع"]';

const rail = (page: Page) => page.locator(RAIL);

/** The feed column the rail is laid out beside. */
const feed = (page: Page) => page.locator('#main-content div.min-w-0').first();

/** `grid-template-columns` of the row the rail sits in, one entry per track. */
async function tracks(element: Locator): Promise<string[]> {
  return element.evaluate((node) => {
    const row = node.parentElement;
    if (!row) return [];
    return getComputedStyle(row).gridTemplateColumns.split(' ').filter(Boolean);
  });
}

test.describe('the community members rail', () => {
  test.use({ viewport: { width: 1280, height: 900 } });

  test('stays beside the feed after a client-side navigation', async ({ page }) => {
    await page.goto('/community');
    await expect(rail(page)).toHaveCount(1);
    expect(await tracks(rail(page))).toHaveLength(2);

    // Land on the home surface (a second stylesheet in the document), then come
    // back the way a visitor does — a link, not a reload.
    await page.locator('nav[data-bottom-tabbar] a[href="/"]').click();
    await expect(page).toHaveURL(/\/$/);
    await page.locator('nav[data-bottom-tabbar] a[href="/community"]').click();
    await expect(page).toHaveURL(/\/community$/);

    await expect(rail(page)).toHaveCount(1);
    expect(await tracks(rail(page))).toHaveLength(2);

    // Two tracks is the stylesheet's word; this is the layout's: the rail is in
    // the same row as the feed, to its side, not stacked underneath it.
    const railBox = await rail(page).boundingBox();
    const feedBox = await feed(page).boundingBox();
    expect(railBox).not.toBeNull();
    expect(feedBox).not.toBeNull();
    expect(railBox!.y).toBeLessThan(feedBox!.y + 200);
    expect(railBox!.x).toBeLessThan(feedBox!.x);
  });

  /**
   * The roster is one cached read shared by every visitor, so the pin cannot be
   * decided on the server: it is taken in the browser from the session. This is
   * that path end to end — signed in, reloaded, the first row is the viewer's
   * own and carries the label nothing else does.
   */
  test('pins the signed-in member to the head of the roster', async ({
    page,
    context,
    baseURL,
  }) => {
    await signIn(context, baseURL!);
    await page.goto('/community');

    const rows = rail(page).getByRole('listitem');
    await expect(rows.first()).toContainText('أنت');
    await expect(rows.first().getByRole('link')).toHaveAttribute('href', /^\/u\//);
    await expect(rail(page).getByText('أنت')).toHaveCount(1);
  });
});
