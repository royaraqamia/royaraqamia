import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, cleanup } from '@testing-library/react';
import type { ComponentType } from 'react';

const warn = vi.hoisted(() => vi.fn());

vi.mock('@/frontend/shared/logger', () => ({
  logger: { warn, error: vi.fn(), info: vi.fn() },
}));

import { tolerateChunkFailure } from '../lazy-chunk';

type Module = { default: ComponentType };

/**
 * A chunk that is merely missing must cost the component that needed it, not the
 * page: a rejected import is a render error, and in the root layout React hands
 * it to the error boundary that replaces the whole route (#332).
 */
describe('tolerateChunkFailure', () => {
  afterEach(() => {
    cleanup();
    warn.mockClear();
  });

  it('degrades a chunk that cannot be fetched to a component that renders nothing', async () => {
    const load = tolerateChunkFailure('widget', () =>
      Promise.reject<Module>(new Error('Failed to load chunk widget'))
    );

    const Fallback = (await load()).default;

    expect(warn).toHaveBeenCalledWith(
      'The widget chunk could not be loaded; rendering nothing instead',
      expect.objectContaining({ error: expect.stringContaining('widget') })
    );
    expect(render(<Fallback />).container).toBeEmptyDOMElement();
  });

  it('passes the real component through when the chunk loads', async () => {
    const Real = () => <div data-testid="real" />;
    const load = tolerateChunkFailure('widget', async () => ({ default: Real }));

    const PassedThrough = (await load()).default;

    expect(render(<PassedThrough />).getByTestId('real')).toBeInTheDocument();
    expect(warn).not.toHaveBeenCalled();
  });
});
