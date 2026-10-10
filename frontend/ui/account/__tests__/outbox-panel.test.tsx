import { describe, it, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import type { OutboxEntry } from '@/frontend/shared/local-store/outbox';

const mocks = vi.hoisted(() => ({
  session: { user: { id: 'u1' } as { id: string } | null },
  diagnostics: {
    ready: true,
    online: true,
    entries: [] as OutboxEntry[],
    pending: 0,
    failed: 0,
    retrying: false,
    retry: vi.fn(),
    removeLocalCopy: vi.fn(),
  },
}));

vi.mock('@/frontend/state/session-provider', () => ({
  useSession: () => mocks.session,
}));

vi.mock('@/frontend/state/habitflow/use-outbox-diagnostics', () => ({
  useOutboxDiagnostics: () => mocks.diagnostics,
}));

import { OutboxPanel } from '../outbox-panel';

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

const failedEntry: OutboxEntry = {
  seq: 1,
  id: 'intent-1',
  entity: 'habit',
  type: 'habit.create',
  payload: {},
  createdAt: Date.now(),
  attempts: 3,
  status: 'failed',
  lastError: 'HTTP 422',
  nextAttemptAt: 0,
};

beforeEach(() => {
  mocks.session.user = { id: 'u1' };
  mocks.diagnostics.entries = [];
  mocks.diagnostics.pending = 0;
  mocks.diagnostics.failed = 0;
  mocks.diagnostics.ready = true;
  mocks.diagnostics.online = true;
  vi.clearAllMocks();
});

afterEach(cleanup);

describe('OutboxPanel', () => {
  it('renders nothing for a guest', () => {
    mocks.session.user = null;
    const { container } = render(<OutboxPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('reports an empty, synced outbox', () => {
    render(<OutboxPanel />);
    expect(screen.getByText('كل التَّغييرات متزامِنة')).toBeInTheDocument();
  });

  it('lists queued changes and offers a retry for failures', () => {
    mocks.diagnostics.entries = [failedEntry];
    mocks.diagnostics.failed = 1;
    render(<OutboxPanel />);

    expect(screen.getByText('إضافة عادة')).toBeInTheDocument();
    expect(screen.getByText('HTTP 422')).toBeInTheDocument();

    screen.getByRole('button', { name: /إعادة المحاولة/ }).click();
    expect(mocks.diagnostics.retry).toHaveBeenCalledTimes(1);
  });

  it('offers to remove this device copy', () => {
    render(<OutboxPanel />);
    expect(screen.getByRole('button', { name: /إزالة نسخة هذا الجهاز/ })).toBeInTheDocument();
  });
});
