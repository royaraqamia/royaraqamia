import { test, expect } from '@playwright/test';
import QRCode from 'qrcode';

/**
 * End-to-end proof of the `/scan` upload path: a real PNG holding a real QR code
 * is decoded on the real route, with no camera and no stubbed decode.
 *
 * Both decoder paths are covered. Chromium ships its own `BarcodeDetector`, so
 * the first test takes the native route; the second removes it, which is what
 * Safari and Firefox look like, and therefore exercises the WASM worker — and
 * proves the engine is fetched from our own origin rather than the library's
 * jsDelivr default (ADR-0035).
 *
 * Run: npx playwright test e2e/scan.spec.ts
 */

const PAYLOAD = 'https://example.com/e2e-scan-check';

async function uploadQrCode(page: import('@playwright/test').Page) {
  const buffer = await QRCode.toBuffer(PAYLOAD, { type: 'png', width: 320 });

  await page.goto('/scan', { timeout: 120_000 });
  await page.getByLabel('اختيار صورة تحتوي على رمز').setInputFiles({
    name: 'scan.png',
    mimeType: 'image/png',
    buffer,
  });

  await expect(page.getByRole('link', { name: /فتح الرَّابط/ })).toHaveAttribute('href', PAYLOAD, {
    timeout: 30_000,
  });
}

test('decodes an uploaded QR image with the browser detector', async ({ page }) => {
  await uploadQrCode(page);

  // The host is shown separately from the payload, so the destination is visible
  // before the visitor commits to opening it.
  await expect(page.getByText('example.com').first()).toBeVisible();
  await expect(page.getByText('QR', { exact: true })).toBeVisible();
});

test('decodes with the self-hosted WASM engine when the browser has none', async ({ page }) => {
  const wasmRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().endsWith('.wasm')) wasmRequests.push(request.url());
  });

  await page.addInitScript(() => {
    delete (window as unknown as Record<string, unknown>).BarcodeDetector;
  });

  await uploadQrCode(page);

  expect(wasmRequests.length).toBeGreaterThan(0);
  for (const url of wasmRequests) {
    expect(new URL(url).origin).toBe(new URL(page.url()).origin);
  }
});
