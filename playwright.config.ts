import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

const isCI = Boolean(process.env.CI);

const VIEWPORTS = {
  mobileSmall: { width: 320, height: 568 },
  mobileMedium: { width: 375, height: 812 },
  mobileLarge: { width: 428, height: 926 },
  tablet: { width: 768, height: 1024 },
};

export default defineConfig({
  testDir: './e2e',
  outputDir: 'node_modules/.playwright/test-results',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 1,
  reporter: [
    ['list'],
    ['html', { open: 'never', outputFolder: 'node_modules/.playwright/report' }],
  ],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    navigationTimeout: 60_000,
  },
  projects: [
    // The responsive projects are a width matrix, not a browser matrix. The
    // Apple descriptors carry `defaultBrowserType: 'webkit'`, which selected
    // WebKit for three of them while the E2E workflow installs Chromium only —
    // so those projects could not launch at all and listed tests nobody ran.
    // Pinning Chromium keeps the device's DPR/touch profile and the width, which
    // is what these specs are about.
    {
      name: 'responsive-mobile-small',
      use: {
        ...devices['Pixel 5'],
        browserName: 'chromium',
        viewport: VIEWPORTS.mobileSmall,
      },
      testMatch: /responsive/,
    },
    {
      name: 'responsive-mobile-medium',
      use: {
        ...devices['iPhone 13'],
        browserName: 'chromium',
        viewport: VIEWPORTS.mobileMedium,
      },
      testMatch: /responsive/,
    },
    {
      name: 'responsive-mobile-large',
      use: {
        ...devices['iPhone 14 Pro Max'],
        browserName: 'chromium',
        viewport: VIEWPORTS.mobileLarge,
      },
      testMatch: /responsive/,
    },
    {
      name: 'responsive-tablet',
      use: {
        ...devices['iPad Pro 11'],
        browserName: 'chromium',
        viewport: VIEWPORTS.tablet,
      },
      testMatch: /responsive/,
    },
    {
      name: 'existing-tests',
      use: {
        viewport: { width: 1280, height: 720 },
      },
      testIgnore: /responsive/,
    },
  ],
  webServer: {
    command: isCI ? 'npm run build && npm run start' : 'npm run dev',
    port: 3000,
    reuseExistingServer: false,
    timeout: isCI ? 600_000 : 180_000,
  },
});
