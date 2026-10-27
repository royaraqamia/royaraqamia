import { describe, expect, it, vi, beforeEach } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

/**
 * The router stub (issue #500): `next/navigation` and `next/link` for a surface
 * rendered by Vite. The one behaviour worth pinning is the split — a link to a
 * remote surface must leave the bundled origin, a link to an owned route must
 * not — because that decision is the spike's whole question and it is easy to
 * lose in a refactor of the stub.
 */

const openRemote = vi.fn(async () => {});

vi.mock('@capacitor/browser', () => ({ Browser: { open: vi.fn(async () => {}) } }));
vi.mock('@capacitor/preferences', () => ({
  Preferences: {
    get: vi.fn(async () => ({ value: null })),
    set: vi.fn(async () => {}),
    remove: vi.fn(async () => {}),
  },
}));

vi.mock('../crossing', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../crossing')>();
  return { ...actual, openRemote };
});

const { navigate, spikeLocation, usePathname, useSearchParams } =
  await import('../next-shims/navigation');
const { default: Link, hrefToString } = await import('../next-shims/link');

function Probe() {
  const pathname = usePathname();
  const search = useSearchParams();
  return (
    <p data-testid="where">
      {pathname}
      {search.toString() ? `?${search.toString()}` : ''}
    </p>
  );
}

beforeEach(() => {
  openRemote.mockClear();
});

describe('router stub', () => {
  it('moves its own location for an owned route', () => {
    navigate('/habitflow?week=2');

    expect(spikeLocation()).toEqual({ pathname: '/habitflow', search: '?week=2' });
    expect(openRemote).not.toHaveBeenCalled();
  });

  it('renders the current location through the hooks the components use', () => {
    navigate('/habitflow?week=3');
    render(<Probe />);

    expect(screen.getByTestId('where')).toHaveTextContent('/habitflow?week=3');
  });

  it('leaves the bundled origin for a remote surface', () => {
    navigate('/community');

    expect(openRemote).toHaveBeenCalledWith('/community', '', expect.any(String));
    // The stub did not pretend to own the route.
    expect(spikeLocation().pathname).toBe('/habitflow');
  });

  it('treats the live origin as remote, whatever the path', () => {
    navigate('https://royaraqamia.com/anything');

    expect(openRemote).toHaveBeenCalledWith('/anything', '', expect.any(String));
  });
});

describe('link stub', () => {
  it('formats the href shapes the components pass', () => {
    expect(hrefToString('/community')).toBe('/community');
    expect(hrefToString({ pathname: '/rates', query: { page: '2' } })).toBe('/rates?page=2');
  });

  it('routes a click through the stub instead of the browser', async () => {
    render(
      <Link href="/habitflow?week=4">
        <span>لوحة</span>
      </Link>
    );

    fireEvent.click(screen.getByText('لوحة'));

    expect(spikeLocation()).toEqual({ pathname: '/habitflow', search: '?week=4' });
  });
});
