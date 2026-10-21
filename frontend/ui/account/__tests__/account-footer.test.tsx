import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';

const { mockPathname } = vi.hoisted(() => ({ mockPathname: vi.fn(() => '/account') }));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname() as string,
}));

import { AccountFooter } from '../account-footer';

const BROWSER_UA =
  'Mozilla/5.0 (Linux; Android 11; sdk_gphone_x86) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.106 Mobile Safari/537.36';
const SHELL_UA = `${BROWSER_UA} RoyaraqamiaShell/1.0.3+20003`;

/* jsdom answers `navigator.userAgent` with its own default; each test installs
   the exact string the way a real browser or shell would send it. */
function stubUserAgent(value: string) {
  Object.defineProperty(window.navigator, 'userAgent', { value, configurable: true });
}

describe('AccountFooter', () => {
  afterEach(() => {
    cleanup();
    delete (window.navigator as { userAgent?: string }).userAgent;
  });

  it('reads the version off the user agent — the layout no longer does', async () => {
    stubUserAgent(SHELL_UA);
    mockPathname.mockReturnValue('/account');
    const { container } = render(<AccountFooter />);

    expect(await screen.findByText('1.0.3')).toBeInTheDocument();
    expect(container.querySelector('[data-account-footer]')).toHaveTextContent('1.0.3');
    expect(screen.queryByText('20003')).not.toBeInTheDocument();
  });

  it('stays off every page behind the front one', async () => {
    stubUserAgent(SHELL_UA);
    mockPathname.mockReturnValue('/account/posts');
    const { container } = render(<AccountFooter />);
    // Let the user-agent read and its state update settle before the negative.
    await act(async () => {});

    expect(container.querySelector('[data-account-footer]')).toBeNull();
    expect(screen.queryByText('1.0.3')).toBeNull();
  });

  it('renders nothing in a browser that sends no shell token', async () => {
    stubUserAgent(BROWSER_UA);
    mockPathname.mockReturnValue('/account');
    const { container } = render(<AccountFooter />);
    await act(async () => {});

    expect(container.querySelector('[data-account-footer]')).toBeNull();
    expect(screen.queryByText('1.0.3')).toBeNull();
  });
});
