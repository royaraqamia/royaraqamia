import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

vi.mock('@/frontend/state/session-provider', () => ({
  useSession: () => ({ user: null, isLoading: false }),
}));

vi.mock('@/frontend/state/plans/use-my-plan', () => ({
  useMyUsage: () => ({ state: null, loading: false, failed: false, reload: vi.fn() }),
}));

import { ProPrice, ServiceDiscountProvider } from '../pro-price';

afterEach(cleanup);

describe('ProPrice', () => {
  it('quotes only the list price to a guest', () => {
    render(
      <ServiceDiscountProvider>
        <ProPrice amountUsd={50} />
      </ServiceDiscountProvider>
    );

    expect(screen.getByText('$50')).toBeInTheDocument();
    expect(screen.queryByText('$40')).not.toBeInTheDocument();
    expect(screen.queryByText('خصم المشتركين 20%')).not.toBeInTheDocument();
  });

  it('quotes the subscriber price beside the struck list price and the badge', () => {
    const { container } = render(
      <ServiceDiscountProvider initialIsPro>
        <ProPrice amountUsd={50} />
      </ServiceDiscountProvider>
    );

    expect(screen.getByText('$40')).toBeInTheDocument();
    expect(screen.getByText('$50')).toBeInTheDocument();
    expect(screen.getByText('خصم المشتركين 20%')).toBeInTheDocument();
    expect(container.querySelector('s')?.textContent).toBe('$50');
  });

  it('rounds a package price to the nearest dollar', () => {
    render(
      <ServiceDiscountProvider initialIsPro>
        <ProPrice amountUsd={27.5} />
      </ServiceDiscountProvider>
    );

    expect(screen.getByText('$22')).toBeInTheDocument();
    expect(screen.getByText('$27.5')).toBeInTheDocument();
  });

  it('can drop the badge where the row is already busy', () => {
    render(
      <ServiceDiscountProvider initialIsPro>
        <ProPrice amountUsd={300} showBadge={false} />
      </ServiceDiscountProvider>
    );

    expect(screen.getByText('$240')).toBeInTheDocument();
    expect(screen.queryByText('خصم المشتركين 20%')).not.toBeInTheDocument();
  });
});
