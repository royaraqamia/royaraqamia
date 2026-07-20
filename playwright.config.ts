import { defineConfig, devices } from '@playwright/test';
import dotenv from 'dotenv';

dotenv.config();

const VIEWPORTS = {
  mobileSmall: { width: 320, height: 568 },
  mobileMedium: { width: 375, height: 812 },
  mobileLarge: { width: 428, height: 926 },
  tablet: { width: 768, height: 1024 },
};

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  retries: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    navigationTimeout: 60_000,
  },
  projects: [
    {
      name: 'responsive-mobile-small',
      use: {
        ...devices['Pixel 5'],
        viewport: VIEWPORTS.mobileSmall,
      },
      testMatch: /responsive/,
    },
    {
      name: 'responsive-mobile-medium',
      use: {
        ...devices['iPhone 13'],
        viewport: VIEWPORTS.mobileMedium,
      },
      testMatch: /responsive/,
    },
    {
      name: 'responsive-mobile-large',
      use: {
        ...devices['iPhone 14 Pro Max'],
        viewport: VIEWPORTS.mobileLarge,
      },
      testMatch: /responsive/,
    },
    {
      name: 'responsive-tablet',
      use: {
        ...devices['iPad Pro 11'],
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
    command: 'npm run dev',
    port: 3000,
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
