import { expect, test } from '@playwright/test';

test.use({ locale: 'ar' });

/** A title far longer than the card, the case that used to escape the row. */
const longBody =
  'الجامعة هذا الرأس وصلةً في الحلقة الرابعة من سلسلة الدروس التي تشرح كيف تبني واجهة مستخدم متجاوبة تعمل على كل الشاشات وتتعامل مع النصوص الطويلة جداً التي لا تنكسر بسهولة care StringBuilderWithoutAnySpacesAtAllInThisPartOfTheText';

const draft = {
  clientId: 'c1',
  slug: 'post-1',
  content: longBody,
  status: 'published',
  coverImage: '',
  metaTitle: '',
  metaDesc: '',
  publishAt: null,
  publishedAt: '2026-01-01T00:00:00.000Z',
  viewCount: 25,
  featured: false,
  communityVisible: true,
  readingTimeMinutes: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  isNew: false,
  deletedAt: null,
};

async function seed(page: import('@playwright/test').Page) {
  await page.addInitScript(
    (rows) => {
      const request = indexedDB.open('blogpress__guest', 3);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains('drafts')) {
          const store = db.createObjectStore('drafts', { keyPath: 'id' });
          store.createIndex('by_updated_at', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('outbox')) {
          db.createObjectStore('outbox', { keyPath: 'seq', autoIncrement: true });
        }
        if (!db.objectStoreNames.contains('media')) {
          db.createObjectStore('media', { keyPath: 'id' });
        }
      };
      request.onsuccess = () => {
        const db = request.result;
        const tx = db.transaction('drafts', 'readwrite');
        for (const row of rows) tx.objectStore('drafts').put(row);
        tx.oncomplete = () => db.close();
      };
    },
    [{ ...draft, id: 'p1' }]
  );
}

test('every post row keeps its controls inside the card', async ({ page }) => {
  await seed(page);
  await page.goto('/account/posts', { waitUntil: 'domcontentloaded' });
  await page.locator("[data-visual='account-posts-row']").first().waitFor();

  const boxes = [
    "[data-visual='account-posts-row-title']",
    "[data-visual='account-posts-row-meta']",
    "[data-visual='account-posts-row-trailing']",
    "button[aria-label='تحديد المنشور']",
    "button[aria-label='تعديل المنشور']",
  ];

  for (const width of [393, 768, 1280, 1840]) {
    await page.setViewportSize({ width, height: 900 });
    const escaped = await page.evaluate((selectors) => {
      const row = document.querySelector("[data-visual='account-posts-row']");
      if (!row) return ['row'];
      const outer = row.getBoundingClientRect();
      const bad: string[] = [];
      for (const selector of selectors) {
        const child = row.querySelector(selector);
        if (!child) {
          bad.push(`missing ${selector}`);
          continue;
        }
        const inner = child.getBoundingClientRect();
        if (
          inner.left < outer.left - 1 ||
          inner.right > outer.right + 1 ||
          inner.top < outer.top - 1 ||
          inner.bottom > outer.bottom + 1
        ) {
          bad.push(selector);
        }
      }
      return bad;
    }, boxes);
    expect(escaped, `escaped boxes at ${width}px`).toEqual([]);
  }
});

test('releasing the opening pointer over a menu item does not publish', async ({ page }) => {
  await seed(page);
  const mutations: string[] = [];
  page.on('request', (request) => {
    if (/\/api\/community\/posts\/.*\/(unpublish|publish)/.test(request.url())) {
      mutations.push(request.url());
    }
  });

  await page.goto('/account/posts', { waitUntil: 'domcontentloaded' });
  await page.setViewportSize({ width: 1280, height: 900 });
  const trigger = page.getByRole('button', { name: 'إجراءات المنشور' }).first();
  await trigger.scrollIntoViewIfNeeded();

  const box = await trigger.boundingBox();
  expect(box).not.toBeNull();
  await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
  await page.mouse.down();
  const publishItem = page.getByRole('menuitem').nth(2); // إلغاء النشر, after تعديل and عرض المنشور
  await expect(publishItem).toBeVisible();
  const item = await publishItem.boundingBox();
  expect(item).not.toBeNull();
  await page.mouse.move(item!.x + item!.width / 2, item!.y + item!.height / 2, { steps: 4 });
  await page.mouse.up();
  await page.waitForTimeout(300);

  expect(mutations).toEqual([]);
  await expect(page.getByRole('menuitem', { name: 'تعديل' })).toBeVisible();
});
