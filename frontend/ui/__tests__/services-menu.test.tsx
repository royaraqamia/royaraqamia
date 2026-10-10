import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import { NavDropdown } from '../navbar/NavDropdown';
import { ServicesMenu } from '../navbar/ServicesMenu';
import { SERVICES_LINK } from '../navbar/services-link';

/* Radix Popper measures the trigger with ResizeObserver; jsdom does not ship it. */
beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ServicesMenu (hero CTA)', () => {
  it('opens a bottom sheet below `lg`', async () => {
    mockMatchMedia(true);
    render(<ServicesMenu trigger={<button type="button">تصفَّح خدماتنا</button>} />);

    fireEvent.click(screen.getByRole('button', { name: 'تصفَّح خدماتنا' }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('طلب بناء مشروع')).toBeInTheDocument();
    // The bottom sheet no longer renders a header or its own close control.
    expect(screen.queryByText('إغلاق')).not.toBeInTheDocument();
  });

  it('opens a popover at `lg` and up', async () => {
    mockMatchMedia(false);
    render(<ServicesMenu trigger={<button type="button">تصفَّح خدماتنا</button>} />);

    fireEvent.click(screen.getByRole('button', { name: 'تصفَّح خدماتنا' }));

    expect(await screen.findByText('طلب بناء مشروع')).toBeInTheDocument();
    expect(screen.queryByText('إغلاق')).not.toBeInTheDocument();
  });
});

describe('NavDropdown overlay (navbar tablet menu)', () => {
  it('opens a bottom sheet below `lg`', async () => {
    mockMatchMedia(true);
    render(<NavDropdown link={SERVICES_LINK} isActive={false} handleHashClick={vi.fn()} overlay />);

    fireEvent.click(screen.getByRole('button', { name: SERVICES_LINK.label }));

    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(screen.getByText('طلب بناء مشروع')).toBeInTheDocument();
  });
});
