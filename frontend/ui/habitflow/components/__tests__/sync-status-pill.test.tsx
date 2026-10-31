import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SyncStatusPill } from '@/frontend/ui/habitflow/components/sync-status-pill';
import type { HabitSyncState } from '@/frontend/state/habitflow/use-habit-sync';

function state(overrides: Partial<HabitSyncState> = {}): HabitSyncState {
  return {
    syncing: false,
    pending: 0,
    failed: 0,
    lastError: null,
    lastFailedType: null,
    online: true,
    entries: [],
    pendingHabitIds: new Set(),
    pendingLogKeys: new Set(),
    retry: vi.fn(),
    refreshError: null,
    retryRefresh: vi.fn(),
    ...overrides,
  };
}

describe('SyncStatusPill', () => {
  it('renders nothing when online and fully synced', () => {
    const { container } = render(<SyncStatusPill status={state()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('persists the offline state even with nothing queued', () => {
    render(<SyncStatusPill status={state({ online: false })} />);
    expect(screen.getByText(/غير متَّصل/)).toBeInTheDocument();
  });

  it('shows the pending count while offline', () => {
    render(<SyncStatusPill status={state({ online: false, pending: 3 })} />);
    expect(screen.getByText(/3 بانتظار المزامنة/)).toBeInTheDocument();
  });

  it('shows a retry action on permanent failure and calls it', () => {
    const retry = vi.fn();
    render(<SyncStatusPill status={state({ failed: 2, retry })} />);

    const button = screen.getByRole('button', { name: /إعادة المحاولة/ });
    button.click();
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it('shows syncing and pending states', () => {
    const { rerender } = render(<SyncStatusPill status={state({ syncing: true })} />);
    expect(screen.getByText('جاري المزامنة…')).toBeInTheDocument();

    rerender(<SyncStatusPill status={state({ pending: 5 })} />);
    expect(screen.getByText(/بانتظار المزامنة \(5\)/)).toBeInTheDocument();
  });

  // #369: a pull that failed is not a failed write — nothing is queued, and the
  // rows on screen may just be older than the account's. It says so, and its
  // retry re-runs the pull rather than the Outbox.
  it('names a failed refresh and retries the pull, not the queue', () => {
    const retry = vi.fn();
    const retryRefresh = vi.fn();
    render(
      <SyncStatusPill status={state({ refreshError: 'sync responded 500', retry, retryRefresh })} />
    );

    const button = screen.getByRole('button', { name: /تعذّر تحديث البيانات/ });
    expect(button).toHaveAttribute('title', 'sync responded 500');
    button.click();
    expect(retryRefresh).toHaveBeenCalledTimes(1);
    expect(retry).not.toHaveBeenCalled();
  });

  it('never lets a failed refresh outrank a failed write', () => {
    render(<SyncStatusPill status={state({ failed: 2, refreshError: 'sync responded 500' })} />);

    expect(screen.getByText(/فشل مزامنة 2/)).toBeInTheDocument();
    expect(screen.queryByText(/تعذّر التحديث/)).not.toBeInTheDocument();
  });

  it('does not name a refresh failure it cannot retry', () => {
    const { container } = render(
      <SyncStatusPill
        status={state({ refreshError: 'sync responded 500', retryRefresh: undefined })}
      />
    );

    expect(container).toBeEmptyDOMElement();
  });

  it('shows offline rather than a refresh failure: the connection is the cause', () => {
    render(
      <SyncStatusPill status={state({ online: false, refreshError: 'sync responded 500' })} />
    );

    expect(screen.getByText(/غير متَّصل/)).toBeInTheDocument();
    expect(screen.queryByText(/تعذّر التحديث/)).not.toBeInTheDocument();
  });
});
