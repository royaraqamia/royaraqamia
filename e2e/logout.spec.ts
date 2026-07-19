import { test, expect } from '@playwright/test';

const TEST_EMAIL = process.env.E2E_TEST_EMAIL!;
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD!;

test.describe('Logout flow', () => {
  test.beforeEach(async ({ page }) => {
    // Warm up the server with a simple request first
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    // Now go to login page
    await page.goto('/auth/login', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 60_000 });

    // Fill in credentials and submit
    await page.fill('input[name="email"]', TEST_EMAIL);
    await page.fill('input[name="password"]', TEST_PASSWORD);
    await page.click('button[type="submit"]');

    // Wait for redirect away from login page
    await page.waitForURL((url) => !url.pathname.includes('/auth/login'), {
      timeout: 30_000,
    });

    // Wait for the page to fully load
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
  });

  test('desktop: shows logout button after login, confirm dialog works, redirects to home', async ({
    page,
  }) => {
    // On desktop viewport, the logout button should be visible
    const logoutBtn = page.locator('button', { hasText: 'تسجيل الخُروج' });
    await expect(logoutBtn).toBeVisible({ timeout: 15_000 });

    // Click logout button
    await logoutBtn.click();

    // Confirmation dialog should appear
    const dialog = page.getByRole('dialog', { name: /تسجيل الخُروج/ });
    await expect(dialog).toBeVisible();

    // Dialog should have confirm and cancel buttons
    const confirmBtn = dialog.locator('button', { hasText: 'تسجيل الخُروج' });
    const cancelBtn = dialog.locator('button', { hasText: 'إلغاء' });
    await expect(confirmBtn).toBeVisible();
    await expect(cancelBtn).toBeVisible();

    // Click cancel — dialog should close, still logged in
    await cancelBtn.click();
    await expect(dialog).not.toBeVisible();
    await expect(logoutBtn).toBeVisible();

    // Click logout again and confirm
    await logoutBtn.click();
    await expect(dialog).toBeVisible();
    await confirmBtn.click();

    // Should redirect to homepage
    await page.waitForURL('/', { timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 30_000 });

    // Login button should now be visible (logged out state)
    const loginBtn = page.locator('a', { hasText: 'تسجيل الدُّخول' }).first();
    await expect(loginBtn).toBeVisible({ timeout: 15_000 });

    // Logout button should NOT be visible
    await expect(logoutBtn).not.toBeVisible();
  });

  test('mobile: shows logout button in mobile menu, confirm dialog works', async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 812 });

    // Open mobile menu
    const menuToggle = page.locator('button[aria-label="فتح القائمة"]');
    await expect(menuToggle).toBeVisible();
    await menuToggle.click();

    // Logout button should be visible in mobile menu
    const logoutBtn = page.locator('button', { hasText: 'تسجيل الخُروج' });
    await expect(logoutBtn).toBeVisible({ timeout: 15_000 });

    // Click logout
    await logoutBtn.click();

    // Confirmation dialog should appear
    const dialog = page.getByRole('dialog', { name: /تسجيل الخُروج/ });
    await expect(dialog).toBeVisible();

    // Confirm logout
    const confirmBtn = dialog.locator('button', { hasText: 'تسجيل الخُروج' });
    await confirmBtn.click();

    // Should redirect to homepage
    await page.waitForURL('/', { timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 30_000 });

    // Login button should be visible
    const loginBtn = page.locator('a', { hasText: 'تسجيل الدُّخول' }).first();
    await expect(loginBtn).toBeVisible({ timeout: 15_000 });
  });

  test('logout clears session - visiting protected page redirects to login', async ({ page }) => {
    // We're logged in from beforeEach. Verify we can access a protected page.
    await page.goto('/spendtrack', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForLoadState('networkidle', { timeout: 30_000 });
    // Should NOT be redirected to login (we're authenticated)
    await expect(page).not.toHaveURL(/\/auth\/login/, { timeout: 10_000 });

    // Now logout via the desktop button
    const logoutBtn = page.locator('button', { hasText: 'تسجيل الخُروج' });
    await expect(logoutBtn).toBeVisible({ timeout: 15_000 });
    await logoutBtn.click();

    const dialog = page.getByRole('dialog', { name: /تسجيل الخُروج/ });
    await expect(dialog).toBeVisible();
    await dialog.locator('button', { hasText: 'تسجيل الخُروج' }).click();

    // Should redirect to homepage
    await page.waitForURL('/', { timeout: 15_000 });
    await page.waitForLoadState('networkidle', { timeout: 30_000 });

    // Now try to visit a protected page — should redirect to login with ?redirect=
    await page.goto('/spendtrack', { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForURL(/\/auth\/login/, { timeout: 30_000 });
    await expect(page).toHaveURL(/\/auth\/login\?redirect=%2Fspendtrack/);
  });
});
