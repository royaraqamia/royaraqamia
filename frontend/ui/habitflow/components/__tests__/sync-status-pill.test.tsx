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
    online: true,
    entries: [],
    pendingHabitIds: new Set(),
    pendingLogKeys: new Set(),
    retry: vi.fn(),
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
    expect(screen.getByText('جارٍ المزامنة…')).toBeInTheDocument();

    rerender(<SyncStatusPill status={state({ pending: 5 })} />);
    expect(screen.getByText(/بانتظار المزامنة \(5\)/)).toBeInTheDocument();
  });
});
