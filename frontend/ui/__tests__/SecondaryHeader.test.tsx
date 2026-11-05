import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

const { mockPathname, mockBack, mockPush, mockReplace } = vi.hoisted(() => ({
  mockPathname: vi.fn(() => '/'),
  mockBack: vi.fn(),
  mockPush: vi.fn(),
  mockReplace: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  usePathname: () => mockPathname(),
  useRouter: () => ({ back: mockBack, push: mockPush, replace: mockReplace }),
}));

import { SecondaryHeader } from '../navbar/SecondaryHeader';
import { recordPathname, resetInAppNavigation } from '../navbar/nav-history';

const SITE_TITLE = 'رؤيَة رقَميَّة';

function header(): HTMLElement | null {
  return document.querySelector('[data-secondary-header]');
}

describe('SecondaryHeader', () => {
  beforeEach(() => {
    mockPathname.mockReturnValue('/');
    document.title = SITE_TITLE;
    resetInAppNavigation();
  });
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('renders nothing on a primary route', () => {
    render(<SecondaryHeader />);

    expect(header()).toBeNull();
    expect(screen.queryByRole('button', { name: 'رجوع' })).not.toBeInTheDocument();
  });

  it('renders the back control on a secondary route', () => {
    mockPathname.mockReturnValue('/rates');

    render(<SecondaryHeader />);

    expect(screen.getByRole('button', { name: 'رجوع' })).toBeInTheDocument();
  });

  it('is a floating control with no bar and no page title', () => {
    mockPathname.mockReturnValue('/rates');
    document.title = `أسعار الصَّرف | ${SITE_TITLE}`;

    render(<SecondaryHeader />);

    // The chrome is the back control alone: the page names itself elsewhere.
    expect(screen.queryByText('أسعار الصَّرف')).not.toBeInTheDocument();
    expect(header()?.querySelector('header')).toBeNull();
  });

  it('keeps the skip link that the top nav owns on primary pages', () => {
    mockPathname.mockReturnValue('/privacy');

    render(<SecondaryHeader />);

    expect(screen.getByText('تخطي إلى المحتوى الرئيسي')).toHaveAttribute('href', '#main-content');
  });

  it('replaces the current entry when the page was opened cold', () => {
    mockPathname.mockReturnValue('/community/some-post');

    render(<SecondaryHeader />);
    fireEvent.click(screen.getByRole('button', { name: 'رجوع' }));

    // `replace`, not `push`: a back press must never leave the page it was
    // pressed on in the history, or the way back into it is one entry away and
    // the two pages trade places (#1075).
    expect(mockReplace).toHaveBeenCalledWith('/community');
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockBack).not.toHaveBeenCalled();
  });

  it('pops real in-app history when there is some', () => {
    recordPathname('/');
    mockPathname.mockReturnValue('/rates');
    recordPathname('/rates');

    render(<SecondaryHeader />);
    fireEvent.click(screen.getByRole('button', { name: 'رجوع' }));

    expect(mockBack).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
    expect(mockReplace).not.toHaveBeenCalled();
  });

  it('goes up instead of popping once the trail is back at its entry', () => {
    // The loop this replaces: /rates → /community/x → back → /rates, and the
    // control believed it could pop again (a counter never comes down), so it
    // went back into /community/x and the two pages traded places.
    recordPathname('/rates');
    recordPathname('/community/x');
    recordPathname('/rates');
    mockPathname.mockReturnValue('/rates');

    render(<SecondaryHeader />);
    fireEvent.click(screen.getByRole('button', { name: 'رجوع' }));

    expect(mockBack).not.toHaveBeenCalled();
    expect(mockReplace).toHaveBeenCalledWith('/');
    expect(mockReplace).not.toHaveBeenCalledWith('/community/x');
  });
});
