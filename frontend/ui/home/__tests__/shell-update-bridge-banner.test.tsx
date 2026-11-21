import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';

import type { ShellManifest } from '@/frontend/shared/shell-update';

const APK_URL = 'https://example.test/royaraqamia-1.3.0.apk';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36';

const mocks = vi.hoisted(() => ({
  manifest: null as ShellManifest | null,
  openInSystemBrowser: vi.fn(async (_url: string) => true),
}));

vi.mock('@/frontend/shared/shell-update', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/frontend/shared/shell-update')>();
  return { ...actual, fetchShellManifest: vi.fn(async () => mocks.manifest) };
});

vi.mock('@/frontend/shared/native-shell', () => ({
  openInSystemBrowser: (url: string) => mocks.openInSystemBrowser(url),
}));

import { ShellUpdateBridgeBanner } from '../shell-update-bridge-banner';

function setDevice(userAgent: string) {
  Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true });
}

const manifest: ShellManifest = {
  versionCode: 20300,
  versionName: '1.3.0',
  apkUrl: APK_URL,
  minSupportedVersionCode: 20000,
  rollout: 0,
};

beforeEach(() => {
  mocks.manifest = manifest;
  mocks.openInSystemBrowser.mockClear();
  setDevice(`${ANDROID_UA} RoyaraqamiaShell/1.2.0+20200`);
});

afterEach(cleanup);

describe('ShellUpdateBridgeBanner', () => {
  it('offers the corrected APK to the shell whose own update card is broken', async () => {
    render(<ShellUpdateBridgeBanner />);

    expect(await screen.findByText('تحديث التطبيق جاهز')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /تنزيل وتثبيت/ })).toBeInTheDocument();
  });

  it('hands the APK to the system browser rather than navigating the WebView', async () => {
    render(<ShellUpdateBridgeBanner />);
    fireEvent.click(await screen.findByRole('button', { name: /تنزيل وتثبيت/ }));

    await vi.waitFor(() => {
      expect(mocks.openInSystemBrowser).toHaveBeenCalledWith(APK_URL);
    });
  });

  it('stays away from a shell that already has the fix', async () => {
    setDevice(`${ANDROID_UA} RoyaraqamiaShell/1.3.0+20300`);
    render(<ShellUpdateBridgeBanner />);

    await Promise.resolve();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('stays away from a browser, which has no shell version to bridge', async () => {
    setDevice(ANDROID_UA);
    render(<ShellUpdateBridgeBanner />);

    await Promise.resolve();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('draws nothing when the manifest names no usable APK', async () => {
    mocks.manifest = { ...manifest, apkUrl: null };
    render(<ShellUpdateBridgeBanner />);

    await Promise.resolve();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});
