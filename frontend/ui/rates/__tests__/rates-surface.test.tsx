import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { RatesBoard } from '@/shared/contracts/rates';
import { READ_FAILURE_COPY } from '@/frontend/ui/shared/read-failure-copy';
import { RATES_PAGE_COPY } from '../rates-page-copy';

vi.mock('@/frontend/ui/rates/RatesExplorer', () => ({
  RatesExplorer: () => <div data-testid="converter" />,
}));

import { RatesSurface } from '../rates-surface';

const BOARD: RatesBoard = {
  base: 'USD',
  fetchedAt: '2026-11-22T06:00:00.000Z',
  providerQuoteDate: '2026-11-22',
  isStale: false,
  currencies: [
    {
      code: 'USD',
      name: 'Dollar',
      symbol: '$',
      rate: 1,
      previousRate: null,
      changePct: null,
      asOf: null,
      parallel: null,
    },
  ],
  metals: [],
};

function response(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

const fetchMock = vi.fn();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('RatesSurface failed read', () => {
  it('announces the sentence with one control that re-runs the read', async () => {
    fetchMock.mockResolvedValueOnce(response(500, {})).mockResolvedValueOnce(response(200, BOARD));

    render(<RatesSurface />);

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent(RATES_PAGE_COPY.failureBody);
    expect(notice.querySelectorAll('button')).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: READ_FAILURE_COPY.retry }));

    await waitFor(() => expect(screen.getByTestId('converter')).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('gives the route a failed loader the same retryable face', async () => {
    fetchMock.mockResolvedValue(response(500, {}));

    render(<RatesSurface board={null} />);

    const notice = await screen.findByRole('status');
    expect(notice).toHaveTextContent(RATES_PAGE_COPY.failureBody);
    expect(screen.getByRole('button', { name: READ_FAILURE_COPY.retry })).toBeTruthy();
  });

  it('keeps reading a board the route already has', () => {
    render(<RatesSurface board={BOARD} />);

    expect(screen.getByTestId('converter')).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
