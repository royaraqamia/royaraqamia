import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

const BROWSER_UA =
  'Mozilla/5.0 (Linux; Android 11) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36';
const SHELL_UA = `${BROWSER_UA} RoyaraqamiaShell/1.1.0+20100`;

const releases = [
  { version: '1.1.0', versionCode: 20100, releasedAt: '2026-11-02', notes: ['ميزة: الكاميرا'] },
  { version: '1.0.22', versionCode: 20022, releasedAt: '2026-10-26', notes: ['إصلاح: التحديث'] },
];

const mocks = vi.hoisted(() => ({
  native: false,
  releases: [] as unknown[],
}));

vi.mock('@/frontend/shared/native-shell', () => ({
  isNativeApp: () => mocks.native,
}));

vi.mock('@/frontend/shared/android-changelog', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/frontend/shared/android-changelog')>();
  return { ...actual, fetchAndroidChangelog: vi.fn(async () => mocks.releases) };
});

import { ChangelogView, ShellChangelogRow } from '../changelog-view';

function setUserAgent(value: string) {
  Object.defineProperty(navigator, 'userAgent', { value, configurable: true });
}

beforeEach(() => {
  mocks.native = false;
  mocks.releases = releases;
  setUserAgent(BROWSER_UA);
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('the changelog row', () => {
  it('is not rendered in a browser', async () => {
    render(<ShellChangelogRow />);
    await Promise.resolve();

    expect(screen.queryByText('ما الجديد')).not.toBeInTheDocument();
  });

  it('links to the changelog inside the shell', async () => {
    setUserAgent(SHELL_UA);
    render(<ShellChangelogRow />);

    expect(await screen.findByText('ما الجديد')).toBeInTheDocument();
    expect(screen.getByRole('link')).toHaveAttribute('href', '/account/changelog');
  });
});

describe('the changelog page', () => {
  it('lists the releases and the notes inside the shell', async () => {
    setUserAgent(SHELL_UA);
    render(<ChangelogView />);

    expect(await screen.findByText('الإصدار 1.1.0')).toBeInTheDocument();
    expect(screen.getByText('ميزة: الكاميرا')).toBeInTheDocument();
    expect(screen.getByText('الإصدار 1.0.22')).toBeInTheDocument();
    expect(screen.getByText('إصلاح: التحديث')).toBeInTheDocument();
    // Newest first.
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      'الإصدار 1.1.0',
      'الإصدار 1.0.22',
    ]);
  });

  it('says so when nothing has been released yet', async () => {
    setUserAgent(SHELL_UA);
    mocks.releases = [];
    render(<ChangelogView />);

    expect(await screen.findByText(/لا توجد ملاحظات منشورة بعد/)).toBeInTheDocument();
  });

  it('shows a browser visitor the app-only notice, never the notes', async () => {
    render(<ChangelogView />);

    expect(
      await screen.findByText(/سجلّ التَّحديثات متاح داخل تطبيق الأندرويد فقط/)
    ).toBeInTheDocument();
    expect(screen.queryByText('ميزة: الكاميرا')).not.toBeInTheDocument();
  });
});
