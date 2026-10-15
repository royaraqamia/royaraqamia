import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import type { ShellManifest } from '@/frontend/shared/shell-update';

const BROWSER_UA =
  'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36';
const SHELL_UA = `${BROWSER_UA} RoyaraqamiaShell/20000`;

const APK_URL =
  'https://github.com/royaraqamia/royaraqamia/releases/download/shell/royaraqamia-shell.apk';

const manifest: ShellManifest = {
  versionCode: 20001,
  versionName: '1.93.0+shell.20001',
  apkUrl: APK_URL,
  minSupportedVersionCode: 20000,
};

const mocks = vi.hoisted(() => ({
  pwa: {
    canInstall: true,
    isInstalled: false,
    promptInstall: vi.fn(async () => true),
  },
  manifest: null as unknown,
}));

vi.mock('@/frontend/ui/PWAProvider', () => ({
  usePWAContext: () => mocks.pwa,
}));

/* Keep the real decision logic; only the network read is faked. */
vi.mock('@/frontend/shared/shell-update', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/frontend/shared/shell-update')>();
  return { ...actual, fetchShellManifest: vi.fn(async () => mocks.manifest) };
});

import { InstallSection } from '../install-section';

function setUserAgent(value: string) {
  Object.defineProperty(navigator, 'userAgent', { value, configurable: true });
}

beforeEach(() => {
  mocks.pwa.canInstall = true;
  mocks.pwa.isInstalled = false;
  mocks.manifest = manifest;
  setUserAgent(BROWSER_UA);
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('InstallSection on the web', () => {
  it('expands into the two installs', async () => {
    render(<InstallSection />);

    const row = await screen.findByRole('button', { name: /تثبيت التَّطبيق/ });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('تثبيت تطبيق الويب')).not.toBeInTheDocument();

    fireEvent.click(row);

    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('تثبيت تطبيق الويب')).toBeInTheDocument();
    expect(screen.getByText('تنزيل تطبيق الأندرويد')).toBeInTheDocument();
    // The APK points at the version the manifest publishes, not a hard-coded URL.
    expect(screen.getByRole('link', { name: /تنزيل تطبيق الأندرويد/ })).toHaveAttribute(
      'href',
      APK_URL
    );
    expect(screen.getByText(/1\.93\.0\+shell\.20001/)).toBeInTheDocument();
  });

  it('asks the browser to install the PWA', async () => {
    render(<InstallSection />);
    fireEvent.click(await screen.findByRole('button', { name: /تثبيت التَّطبيق/ }));
    fireEvent.click(screen.getByRole('button', { name: /تثبيت تطبيق الويب/ }));

    expect(mocks.pwa.promptInstall).toHaveBeenCalledTimes(1);
  });

  it('drops the PWA sub-row when the browser cannot offer one', async () => {
    mocks.pwa.canInstall = false;
    render(<InstallSection />);
    fireEvent.click(await screen.findByRole('button', { name: /تثبيت التَّطبيق/ }));

    expect(screen.queryByText('تثبيت تطبيق الويب')).not.toBeInTheDocument();
    expect(screen.getByText('تنزيل تطبيق الأندرويد')).toBeInTheDocument();
  });

  it('drops the PWA sub-row once the app is installed', async () => {
    mocks.pwa.canInstall = false;
    mocks.pwa.isInstalled = true;
    render(<InstallSection />);
    fireEvent.click(await screen.findByRole('button', { name: /تثبيت التَّطبيق/ }));

    expect(screen.queryByText('تثبيت تطبيق الويب')).not.toBeInTheDocument();
  });

  it('renders nothing when there is no manifest and no install prompt', async () => {
    mocks.pwa.canInstall = false;
    mocks.manifest = null;
    render(<InstallSection />);

    await Promise.resolve();
    expect(screen.queryByText(/تثبيت التَّطبيق/)).not.toBeInTheDocument();
  });
});

describe('InstallSection inside the Android shell', () => {
  beforeEach(() => {
    setUserAgent(SHELL_UA);
  });

  it('offers a check instead of an install, with no sub-rows', async () => {
    render(<InstallSection />);

    const check = await screen.findByRole('button', { name: 'التَّحقُّق من وجود تحديث' });
    expect(screen.queryByText('تثبيت التَّطبيق')).not.toBeInTheDocument();
    expect(check).not.toHaveAttribute('aria-expanded');
  });

  it('reports a published APK newer than the one it is running', async () => {
    render(<InstallSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'التَّحقُّق من وجود تحديث' }));

    expect(
      await screen.findByText('يتوفَّر تحديث جديد — سيُعرَض عليك عند إعادة فتح التَّطبيق.')
    ).toBeInTheDocument();
  });

  it('reports being current', async () => {
    mocks.manifest = { ...manifest, versionCode: 20000 };
    render(<InstallSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'التَّحقُّق من وجود تحديث' }));

    expect(await screen.findByText('أنت على أحدث إصدار.')).toBeInTheDocument();
  });

  it('says so when the manifest cannot be read', async () => {
    mocks.manifest = null;
    render(<InstallSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'التَّحقُّق من وجود تحديث' }));

    expect(
      await screen.findByText('تعذَّر التَّحقُّق من التَّحديث. حاول مرَّة أخرى.')
    ).toBeInTheDocument();
  });
});
