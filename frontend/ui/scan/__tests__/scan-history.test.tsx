import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getScanHistory, clearScanHistory } = vi.hoisted(() => ({
  getScanHistory: vi.fn(),
  clearScanHistory: vi.fn(),
}));

vi.mock('@/frontend/api/scan-history', () => ({
  SCAN_HISTORY_PATH: '/api/scan/history',
  getScanHistory,
  clearScanHistory,
}));

import { ScanHistory } from '@/frontend/ui/scan/scan-history';
import { SCAN_HISTORY_COPY } from '@/frontend/ui/scan/scan-history-copy';
import type { ScanHistoryEntry } from '@/shared/contracts/scan-history';

/**
 * The section's three promises (#1430): a guest is told what sign-in would do
 * rather than shown an empty list, a row says what was scanned without its
 * payload, and clearing is a question followed by the list being gone.
 */

function entry(overrides: Partial<ScanHistoryEntry> = {}): ScanHistoryEntry {
  return {
    id: 'row-1',
    kind: 'link',
    format: 'qr_code',
    label: 'cafe.example',
    lastSeenDate: '2026/12/12',
    lastSeenAt: '2026-12-12T20:30:00.000Z',
    seenCount: 1,
    ...overrides,
  };
}

function renderHistory(signedIn = true, reloadToken = 0) {
  return render(<ScanHistory signedIn={signedIn} loading={false} reloadToken={reloadToken} />);
}

beforeEach(() => {
  getScanHistory.mockReset();
  clearScanHistory.mockReset();
  getScanHistory.mockResolvedValue([]);
});

describe('ScanHistory', () => {
  it('asks a guest to sign in, and reads nothing', () => {
    renderHistory(false);

    expect(screen.getByText(SCAN_HISTORY_COPY.signedOut)).toBeInTheDocument();
    expect(getScanHistory).not.toHaveBeenCalled();
  });

  it('draws a row as the service, the kind, the count and the day', async () => {
    getScanHistory.mockResolvedValue([entry({ seenCount: 3 })]);

    renderHistory();

    expect(await screen.findByText('cafe.example')).toBeInTheDocument();
    expect(
      screen.getByText(SCAN_HISTORY_COPY.seenMany.replace('{count}', '3'), { exact: false })
    ).toBeInTheDocument();
    expect(
      screen.getByText(SCAN_HISTORY_COPY.lastSeen.replace('{date}', '2026/12/12'), {
        exact: false,
      })
    ).toBeInTheDocument();
  });

  it('falls back to the kind when a code has no safe label', async () => {
    getScanHistory.mockResolvedValue([entry({ kind: 'text', label: null })]);

    renderHistory();

    expect(await screen.findByText('نصّ')).toBeInTheDocument();
    expect(screen.getByText(SCAN_HISTORY_COPY.seenOnce, { exact: false })).toBeInTheDocument();
  });

  it('says so when the read failed, and retries on the same route', async () => {
    getScanHistory.mockRejectedValueOnce(new Error('offline'));

    renderHistory();

    expect(await screen.findByText(SCAN_HISTORY_COPY.failed)).toBeInTheDocument();
    getScanHistory.mockResolvedValueOnce([entry()]);
    fireEvent.click(screen.getByRole('button', { name: SCAN_HISTORY_COPY.retry }));

    expect(await screen.findByText('cafe.example')).toBeInTheDocument();
  });

  it('asks before clearing, then says the list is gone', async () => {
    getScanHistory.mockResolvedValue([entry()]);
    clearScanHistory.mockResolvedValue(1);

    renderHistory();
    await screen.findByText('cafe.example');

    fireEvent.click(screen.getByRole('button', { name: SCAN_HISTORY_COPY.clear }));
    expect(screen.getByText(SCAN_HISTORY_COPY.clearQuestion)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: SCAN_HISTORY_COPY.clearConfirm }));

    await waitFor(() => expect(clearScanHistory).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(SCAN_HISTORY_COPY.cleared)).toBeInTheDocument();
    expect(screen.queryByText('cafe.example')).not.toBeInTheDocument();
  });

  it('reads again when a scan bumps the token', async () => {
    const { rerender } = renderHistory();

    await waitFor(() => expect(getScanHistory).toHaveBeenCalledTimes(1));
    getScanHistory.mockResolvedValue([entry()]);
    rerender(<ScanHistory signedIn loading={false} reloadToken={1} />);

    expect(await screen.findByText('cafe.example')).toBeInTheDocument();
  });
});
