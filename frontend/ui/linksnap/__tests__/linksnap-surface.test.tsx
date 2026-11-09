import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('../link-snap-app-view', () => ({ LinkSnapAppView: () => <div>app view</div> }));
vi.mock('../linksnap-links-fab', () => ({ LinksnapLinksFab: () => <div>links fab</div> }));

import { LinkSnapSurface } from '../linksnap-surface';

/**
 * The surface owns the links door (ADR-0153, amended): the route draws it, and
 * so does the homepage under its strip. A FAB mounted only by the route leaves
 * the tab without one, which is the regression this pins.
 */
describe('LinkSnapSurface', () => {
  it('draws the links door beside the app', () => {
    render(<LinkSnapSurface />);

    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    expect(screen.getByText('app view')).toBeInTheDocument();
    expect(screen.getByText('links fab')).toBeInTheDocument();
  });
});
