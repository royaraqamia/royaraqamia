import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';

const mocks = vi.hoisted(() => ({
  readDeviceCopies: vi.fn(),
  retryDeviceEntry: vi.fn(),
  removeDeviceCopies: vi.fn(),
  requestOutboxFlush: vi.fn(),
  requestShellFlush: vi.fn(),
}));

vi.mock('@/frontend/shared/local-store/device-copy', () => {
  class DeviceListingUnsupportedError extends Error {}

  return {
    DeviceListingUnsupportedError,
    // The derived fallback is pure naming; the real implementation has its own
    // suite, so this only needs the shape the page renders.
    derivedDeviceCopies: (identity: string) => [
      { name: `habitflow__${identity}`, product: 'habitflow', label: 'تتبُّع العادات', identity },
    ],
    readDeviceCopies: mocks.readDeviceCopies,
    retryDeviceEntry: mocks.retryDeviceEntry,
    removeDeviceCopies: mocks.removeDeviceCopies,
  };
});

vi.mock('@/frontend/shared/local-store/background-sync', () => ({
  requestOutboxFlush: mocks.requestOutboxFlush,
  requestShellFlush: mocks.requestShellFlush,
}));

vi.mock('@/frontend/state/session-provider', () => ({
  useSession: () => ({ user: null }),
}));

vi.mock('@/frontend/shared/format', () => ({
  calculateTimeAgo: () => 'منذ 10 دقيقة',
}));

import { DeviceView } from '../device-view';

const ACCOUNT = 'habitflow__user:01234567-89ab';

function copy(overrides: Record<string, unknown> = {}) {
  return {
    name: ACCOUNT,
    product: 'habitflow',
    label: 'تتبُّع العادات',
    identity: 'user:01234567-89ab',
    entries: [],
    error: null,
    ...overrides,
  };
}

function entry(overrides: Record<string, unknown> = {}) {
  return {
    seq: 1,
    id: 'intent-1',
    entity: 'habit',
    type: 'habit.create',
    payload: {},
    createdAt: Date.parse('2026-10-20T09:50:00Z'),
    attempts: 0,
    status: 'pending',
    lastError: null,
    nextAttemptAt: 0,
    ...overrides,
  };
}

beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    globalThis.ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    } as unknown as typeof ResizeObserver;
  }
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.readDeviceCopies.mockResolvedValue([]);
  mocks.removeDeviceCopies.mockResolvedValue({ removed: [ACCOUNT], blocked: [], queued: 1 });
  mocks.requestOutboxFlush.mockResolvedValue(true);
});

afterEach(cleanup);

describe('DeviceView', () => {
  it('shows the queue per item: type, entity, age and last error', async () => {
    mocks.readDeviceCopies.mockResolvedValue([
      copy({
        entries: [
          entry(),
          entry({
            seq: 2,
            id: 'intent-2',
            type: 'log.toggle',
            entity: 'habit_log',
            status: 'failed',
            lastError: 'HTTP 400',
          }),
        ],
      }),
    ]);

    render(<DeviceView />);

    expect(await screen.findByText('نسخة الحساب')).toBeInTheDocument();
    expect(screen.getByText('habit.create')).toBeInTheDocument();
    expect(screen.getByText(/habit_log/)).toBeInTheDocument();
    expect(screen.getAllByText('منذ 10 دقيقة')).toHaveLength(2);
    expect(screen.getByText('HTTP 400')).toBeInTheDocument();
    expect(screen.getByText('1 بانتظار المزامنة')).toBeInTheDocument();
    expect(screen.getByText(/1 فشل/)).toBeInTheDocument();
  });

  it('re-arms one failed item and asks the background tiers to deliver it', async () => {
    mocks.readDeviceCopies
      .mockResolvedValueOnce([
        copy({ entries: [entry({ seq: 3, status: 'failed', lastError: 'HTTP 400' })] }),
      ])
      .mockResolvedValueOnce([copy({ entries: [entry({ seq: 3 })] })]);
    mocks.retryDeviceEntry.mockResolvedValue(true);

    render(<DeviceView />);

    fireEvent.click(await screen.findByRole('button', { name: /إعادة المحاولة/ }));

    await waitFor(() => expect(mocks.retryDeviceEntry).toHaveBeenCalledWith(ACCOUNT, 3));
    expect(mocks.requestOutboxFlush).toHaveBeenCalled();
    expect(mocks.requestShellFlush).toHaveBeenCalled();
    expect(await screen.findByText(/أُعيدت العمليَّة إلى قائمة الانتظار/)).toBeInTheDocument();
  });

  it('removes the copy after a confirmation and says what it took', async () => {
    mocks.readDeviceCopies
      .mockResolvedValueOnce([copy({ entries: [entry()] })])
      .mockResolvedValueOnce([]);

    render(<DeviceView />);

    fireEvent.click(await screen.findByRole('button', { name: /إزالة نسخة الحساب/ }));

    const dialog = await screen.findByRole('dialog');
    // The confirm names the queue that will not reach the server.
    expect(dialog).toHaveTextContent('عملية واحدة');

    fireEvent.click(screen.getByRole('button', { name: 'إزالة' }));

    await waitFor(() => expect(mocks.removeDeviceCopies).toHaveBeenCalledWith([ACCOUNT]));
    expect(
      await screen.findByText(/أُزيلت نسخة الحساب — مخزن واحد، ومعها عملية واحدة لم تُزامَن بعد/)
    ).toBeInTheDocument();
    expect(await screen.findByText('لا توجد نسخة محلِّيَّة على هذا الجهاز')).toBeInTheDocument();
  });

  it('offers removal only, with a stated limit, where the browser cannot list databases', async () => {
    const { DeviceListingUnsupportedError } =
      await import('@/frontend/shared/local-store/device-copy');
    mocks.readDeviceCopies.mockRejectedValue(new DeviceListingUnsupportedError());

    render(<DeviceView />);

    expect(await screen.findByText(/لا يستطيع هذا المتصفِّح سرد مخازن الجهاز/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /إزالة نسخة الزَّائر/ })).toBeInTheDocument();
  });

  it('removes by name where the browser cannot list, without claiming a count', async () => {
    const { DeviceListingUnsupportedError } =
      await import('@/frontend/shared/local-store/device-copy');
    mocks.readDeviceCopies.mockRejectedValue(new DeviceListingUnsupportedError());
    mocks.removeDeviceCopies.mockResolvedValue({
      removed: ['habitflow__guest'],
      blocked: [],
      queued: 0,
    });

    render(<DeviceView />);

    fireEvent.click(await screen.findByRole('button', { name: /إزالة نسخة الزَّائر/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'إزالة' }));

    await waitFor(() =>
      expect(mocks.removeDeviceCopies).toHaveBeenCalledWith(['habitflow__guest'])
    );
    expect(await screen.findByText('أُزيلت نسخة الزَّائر من هذا الجهاز.')).toBeInTheDocument();
  });

  it('states the empty device instead of an empty table', async () => {
    render(<DeviceView />);

    expect(await screen.findByText('لا توجد نسخة محلِّيَّة على هذا الجهاز')).toBeInTheDocument();
  });
});
