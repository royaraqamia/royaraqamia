import { expect, test, type Page } from '@playwright/test';

/**
 * The warm-up gate (ADR-0230), measured the way the member's browser meets it.
 *
 * A browser that opened نور once fetches the panel's chunk while the page is
 * idle, so the next tap opens an already-parsed conversation. That chunk is the
 * composer, the editor and the conversation — the bulk of the assistant — and
 * on a connection that reported `saveData` or a `2g` estimate the member has
 * said the bytes are not free. The warm-up has to leave them for the tap.
 *
 * The two tests are a pair on purpose: the control proves the marker search can
 * see the chunk at all, so the metered test cannot pass by looking for the
 * wrong thing.
 */
test.use({
  viewport: { width: 393, height: 852 },
  deviceScaleFactor: 2.75,
  colorScheme: 'dark',
  locale: 'ar',
});

const OPENED_KEY = 'royaraqamia:assistant:opened';
// A string in the panel's own module (its dialog content), so the marker is the
// panel chunk rather than any script on the page.
const PANEL_MARKER = 'data-assistant-panel';

/** Watches every same-origin script body; returns a question about them. */
function watchPanelChunk(page: Page, origin: string) {
  const bodies: Array<Promise<string>> = [];
  page.on('response', (response) => {
    if (response.request().resourceType() !== 'script') return;
    if (new URL(response.url()).origin !== new URL(origin).origin) return;
    bodies.push(
      response
        .body()
        .then((body) => body.toString('utf8'))
        .catch(() => '')
    );
  });
  return async (): Promise<boolean> => {
    const text = (await Promise.all(bodies)).join('\n');
    return text.includes(PANEL_MARKER);
  };
}

async function seedReturningReader(page: Page) {
  await page.addInitScript((key) => {
    window.localStorage.setItem(key, '1');
  }, OPENED_KEY);
}

test('a returning reader on a fast connection warms the panel chunk while idle', async ({
  page,
  baseURL,
}) => {
  await seedReturningReader(page);
  const panelLoaded = watchPanelChunk(page, baseURL!);

  await page.goto('/');
  await expect(page.locator('[data-assistant-launcher]')).toBeVisible();

  // The warm-up is an idle callback with a 3000 ms timeout; the poll is the
  // deadline for the fetch and its parse on a cold dev server.
  await expect.poll(panelLoaded, { timeout: 30_000 }).toBe(true);
});

test('a returning reader who asked to save data keeps the chunk until the tap', async ({
  page,
  baseURL,
}) => {
  await seedReturningReader(page);
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'connection', {
      configurable: true,
      get: () => ({ saveData: true, effectiveType: '4g' }),
    });
  });
  const panelLoaded = watchPanelChunk(page, baseURL!);

  await page.goto('/');
  await expect(page.locator('[data-assistant-launcher]')).toBeVisible();

  // Past the warm-up's own 3000 ms deadline with room for the request.
  await page.waitForTimeout(6_000);
  expect(await panelLoaded()).toBe(false);

  // The door still opens: the tap is what fetches the chunk.
  await page.locator('[data-assistant-launcher]').click();
  await expect(page.locator('[data-assistant-panel]')).toBeVisible();
});
