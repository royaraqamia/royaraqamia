import { test, expect, type Page } from '@playwright/test';

/**
 * «بدء المهمة» on `/coding` (#1888).
 *
 * The form is the primary door to a coding task, and it used to be a dead one:
 * it renders before the parent's repository read resolves, so the initial state
 * was read from an empty list — the selection stayed `''`, the branch stayed
 * `main`, and `submit` returned before any request left the page.
 *
 * The read is answered here rather than from the database on purpose: the race
 * is the subject, and a connected workspace needs a GitHub App installation the
 * fixture account does not carry. Nothing is faked below the transport layer —
 * the page, the form, the API client and the navigation are the real ones.
 */

const WORKSPACE_ID = '5f0a3c1e-6a2b-4c7d-8e9f-0a1b2c3d4e5f';
const TASK_ID = '0b9c8d7e-1f2a-4b3c-9d8e-7f6a5b4c3d2e';

const WORKSPACE = {
  id: WORKSPACE_ID,
  repoOwner: 'royaraqamia',
  repoName: 'royaraqamia',
  defaultBranch: 'develop',
  bootstrapPrUrl: null,
  createdAt: '2026-11-20T08:00:00.000Z',
};

const TITLE = 'إصلاح زر بدء المهمة';
const INSTRUCTION = 'أضف اختبارًا يغطي النموذج.';

const TASK = {
  id: TASK_ID,
  workspaceId: WORKSPACE_ID,
  title: TITLE,
  instruction: INSTRUCTION,
  mode: 'plan',
  status: 'queued',
  branch: null,
  pullRequestUrl: null,
  summary: '',
  failureCode: null,
  steps: [],
  createdAt: '2026-11-26T09:00:00.000Z',
  updatedAt: '2026-11-26T09:00:00.000Z',
};

/**
 * Answers every coding route the page reads, and records each create body so a
 * test can assert what the form actually sent. `createError` turns the write
 * into a refusal so the error sentence has a source.
 */
async function mockCodingApi(
  page: Page,
  options: { createError?: { status: number; message: string } } = {}
): Promise<Array<Record<string, unknown>>> {
  const posted: Array<Record<string, unknown>> = [];

  await page.route(
    (url) => url.pathname.startsWith('/api/coding/'),
    async (route) => {
      const request = route.request();
      const method = request.method();
      const path = new URL(request.url()).pathname;

      if (path === '/api/coding/repos' && method === 'GET') {
        return route.fulfill({ json: [] });
      }
      if (path === '/api/coding/workspaces' && method === 'GET') {
        return route.fulfill({ json: [WORKSPACE] });
      }
      if (path === '/api/coding/tasks' && method === 'GET') {
        return route.fulfill({ json: { tasks: [], nextCursor: null } });
      }
      if (path === '/api/coding/tasks' && method === 'POST') {
        posted.push(request.postDataJSON() as Record<string, unknown>);
        if (options.createError) {
          return route.fulfill({
            status: options.createError.status,
            json: { success: false, error: options.createError.message },
          });
        }
        return route.fulfill({ json: TASK });
      }
      if (path === `/api/coding/tasks/${TASK_ID}` && method === 'GET') {
        return route.fulfill({ json: TASK });
      }
      return route.fulfill({ status: 404, json: { success: false, error: 'not mocked' } });
    }
  );

  return posted;
}

/** Fills the three fields the issue names, leaving the mode on its default. */
async function fillForm(page: Page, baseBranch: string) {
  const form = page.locator('form');
  await form.getByLabel('العنوان').fill(TITLE);
  await form.getByLabel('ما تريد تنفيذه').fill(INSTRUCTION);
  await form.getByLabel('الفرع الأساسي').fill(baseBranch);
  return form;
}

// The API is answered from the route layer, so a service worker's own fetch
// would be invisible to it; blocking the worker keeps the mock authoritative.
test.use({ serviceWorkers: 'block' });

test.describe('the new coding task form', () => {
  test('a filled form posts the task and lands on its page', async ({ page }) => {
    const posted = await mockCodingApi(page);
    await page.goto('/coding');

    // The workspace list arrives after this form's first render. Its default
    // branch must follow it: the field used to keep a hardcoded `main`.
    await expect(page.getByLabel('الفرع الأساسي')).toHaveValue('develop');

    const form = await fillForm(page, 'release/2026');
    const created = page.waitForRequest(
      (request) =>
        request.method() === 'POST' && new URL(request.url()).pathname === '/api/coding/tasks'
    );

    await form.getByRole('button', { name: 'بدء المهمة' }).click();

    await created;
    await page.waitForURL(`**/coding/${TASK_ID}`);
    expect(posted).toEqual([
      {
        workspaceId: WORKSPACE_ID,
        title: TITLE,
        instruction: INSTRUCTION,
        mode: 'plan',
        baseBranch: 'release/2026',
      },
    ]);
    await expect(page.getByRole('heading', { name: 'تفاصيل المهمة' })).toBeVisible();
  });

  test('a refused task shows the server sentence and keeps the page', async ({ page }) => {
    const refusal = 'تجاوزت حدّ المهام الشهرية في خطتك.';
    await mockCodingApi(page, { createError: { status: 429, message: refusal } });
    await page.goto('/coding');

    const form = await fillForm(page, 'develop');
    await form.getByRole('button', { name: 'بدء المهمة' }).click();

    await expect(page.getByText(refusal)).toBeVisible();
    // The button comes back: a refusal is not a spinner that never ends.
    await expect(form.getByRole('button', { name: 'بدء المهمة' })).toBeEnabled();
    expect(new URL(page.url()).pathname).toBe('/coding');
  });
});
