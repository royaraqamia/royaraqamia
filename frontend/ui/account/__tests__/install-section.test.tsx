import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import type { ShellManifest } from '@/frontend/shared/shell-update';

const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36';
const SHELL_UA = `${ANDROID_UA} RoyaraqamiaShell/20000`;
const DESKTOP_CHROME_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const IOS_SAFARI_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';
const IOS_CHROME_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/120.0.6099.119 Mobile/15E148 Safari/604.1';
/** iPadOS reports the Macintosh agent; only the touch points tell it apart. */
const MAC_SAFARI_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15';
const FIREFOX_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:121.0) Gecko/20100101 Firefox/121.0';

const APK_URL = 'https://example.test/royaraqamia-1.0.4.apk';

const manifest: ShellManifest = {
  versionCode: 20001,
  versionName: '1.93.0+shell.20001',
  apkUrl: APK_URL,
  minSupportedVersionCode: 20000,
  rollout: 100,
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

function setDevice(userAgent: string, maxTouchPoints = 0) {
  Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true });
  Object.defineProperty(navigator, 'maxTouchPoints', {
    value: maxTouchPoints,
    configurable: true,
  });
}

beforeEach(() => {
  mocks.pwa.canInstall = true;
  mocks.pwa.isInstalled = false;
  mocks.manifest = manifest;
  setDevice(ANDROID_UA);
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('InstallSection on Android', () => {
  it('offers the APK alone, as the row itself', async () => {
    render(<InstallSection />);

    const apk = await screen.findByRole('link', { name: /تنزيل تطبيق الأندرويد/ });
    expect(apk).toHaveAttribute('href', APK_URL);
    expect(apk).toHaveAttribute('download');
    expect(apk).toHaveTextContent('1.93.0+shell.20001');

    // The PWA is not a second channel here: no prompt and no browser row.
    expect(screen.queryByText('تثبيت التَّطبيق')).not.toBeInTheDocument();
    expect(screen.queryByText(/تطبيق الويب/)).not.toBeInTheDocument();
  });

  it('offers no install prompt even when the browser can install the PWA', async () => {
    render(<InstallSection />);

    await screen.findByRole('link', { name: /تنزيل تطبيق الأندرويد/ });
    expect(mocks.pwa.promptInstall).not.toHaveBeenCalled();
  });

  it('renders nothing when the manifest cannot be read', async () => {
    mocks.manifest = null;
    render(<InstallSection />);

    await Promise.resolve();
    await Promise.resolve();
    expect(screen.queryByText(/تنزيل تطبيق الأندرويد/)).not.toBeInTheDocument();
    expect(screen.queryByText('تثبيت التَّطبيق')).not.toBeInTheDocument();
  });
});

describe('InstallSection on a desktop', () => {
  beforeEach(() => {
    setDevice(DESKTOP_CHROME_UA);
  });

  it('offers one row that asks the browser to install the PWA', async () => {
    render(<InstallSection />);

    const row = await screen.findByRole('button', { name: /تثبيت التَّطبيق/ });
    expect(screen.queryByText(/تنزيل تطبيق الأندرويد/)).not.toBeInTheDocument();

    fireEvent.click(row);
    expect(mocks.pwa.promptInstall).toHaveBeenCalledTimes(1);
  });

  it('drops the row when the browser has no prompt to offer', async () => {
    mocks.pwa.canInstall = false;
    render(<InstallSection />);

    await Promise.resolve();
    expect(screen.queryByText('تثبيت التَّطبيق')).not.toBeInTheDocument();
  });

  it('drops the row once the app is installed', async () => {
    mocks.pwa.isInstalled = true;
    render(<InstallSection />);

    await Promise.resolve();
    expect(screen.queryByText('تثبيت التَّطبيق')).not.toBeInTheDocument();
  });

  it('writes Safari’s own steps instead of a button it cannot press', async () => {
    setDevice(MAC_SAFARI_UA);
    render(<InstallSection />);

    expect(await screen.findByText(/من قائمة ملف ← إضافة إلى Dock/)).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('renders nothing on Firefox, which has no install path at all', async () => {
    setDevice(FIREFOX_UA);
    render(<InstallSection />);

    await Promise.resolve();
    expect(screen.queryByText('تثبيت التَّطبيق')).not.toBeInTheDocument();
  });
});

describe('InstallSection on iOS', () => {
  it('writes the Share steps for Safari', async () => {
    setDevice(IOS_SAFARI_UA, 5);
    render(<InstallSection />);

    expect(
      await screen.findByText(/من زر المشاركة ← إضافة إلى الشَّاشة الرَّئيسيَّة/)
    ).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('treats an iPad, which reports a Mac agent, as iOS rather than desktop', async () => {
    setDevice(MAC_SAFARI_UA, 5);
    render(<InstallSection />);

    expect(
      await screen.findByText(/من زر المشاركة ← إضافة إلى الشَّاشة الرَّئيسيَّة/)
    ).toBeInTheDocument();
  });

  it('renders nothing in Chrome on iOS, which cannot add to the home screen', async () => {
    setDevice(IOS_CHROME_UA, 5);
    render(<InstallSection />);

    await Promise.resolve();
    expect(screen.queryByText('تثبيت التَّطبيق')).not.toBeInTheDocument();
  });
});

describe('InstallSection inside the Android shell', () => {
  beforeEach(() => {
    setDevice(SHELL_UA);
  });

  it('names the installed version under the check', async () => {
    setDevice(`${ANDROID_UA} RoyaraqamiaShell/1.0.7+20000`);
    render(<InstallSection />);

    const check = await screen.findByRole('button', { name: /التَّحقُّق من وجود تحديث/ });
    expect(check).toHaveTextContent('الإصدار 1.0.7');
  });

  it('offers a check instead of an install', async () => {
    render(<InstallSection />);

    await screen.findByRole('button', { name: 'التَّحقُّق من وجود تحديث' });
    expect(screen.queryByText('تثبيت التَّطبيق')).not.toBeInTheDocument();
    expect(screen.queryByText(/تنزيل تطبيق الأندرويد/)).not.toBeInTheDocument();
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

    expect(await screen.findByText('تعذَّر التَّحقُّق من التَّحديث. حاول مرَّة أخرى.')).toBeInTheDocument();
  });
});
