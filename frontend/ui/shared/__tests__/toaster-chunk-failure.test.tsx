import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

const warn = vi.hoisted(() => vi.fn());

vi.mock('@/frontend/shared/logger', () => ({
  logger: { warn, error: vi.fn(), info: vi.fn(), debug: vi.fn() },
}));

import { loadToasterModule } from '../toaster';

/**
 * `RoyaToaster` sits in the root layout, so a chunk that cannot be fetched —
 * offline before it was ever cached — used to reject into the page's error
 * boundary and replace the whole route with an error card on the first tap
 * (docs/specs/offline-first.md).
 */
describe('loadToasterModule', () => {
  it('falls back to a component that renders nothing when the chunk rejects', async () => {
    const module = await loadToasterModule(() =>
      Promise.reject(new Error('Failed to load chunk toaster-core'))
    );

    expect(warn).toHaveBeenCalledWith(
      'The toaster chunk could not be loaded',
      expect.objectContaining({ error: expect.stringContaining('toaster-core') })
    );

    // Rendering the fallback must not throw.
    const Fallback = module.default;
    expect(render(<Fallback />).container).toBeEmptyDOMElement();
  });

  it('passes the real chunk through when it loads', async () => {
    const RoyaToasterCore = () => <div data-testid="core" />;
    const module = await loadToasterModule(async () => ({ RoyaToasterCore }));

    expect(render(<module.default />).getByTestId('core')).toBeInTheDocument();
    expect(warn).not.toHaveBeenCalled();
  });
});
