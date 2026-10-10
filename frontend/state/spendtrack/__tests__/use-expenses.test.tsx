import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import { useEffect } from 'react';

vi.mock('@/frontend/api/spendtrack/sync-transport', () => ({
  createSpendtrackHttpSyncTransport: () => ({ send: vi.fn().mockResolvedValue(undefined) }),
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import {
  SpendtrackProvider,
  useSpendtrackContext,
} from '@/frontend/state/spendtrack/spendtrack-context';
import { useSaveExpense } from '@/frontend/state/spendtrack/use-expenses';
import type { SpendtrackLocalStore } from '@/frontend/api/spendtrack/local-store';

let captured: {
  submit: (data: {
    amount: string;
    category_id: string;
    date: string;
    description?: string;
  }) => Promise<boolean>;
  store: SpendtrackLocalStore;
} | null = null;

function Harness() {
  const context = useSpendtrackContext();
  const { submit } = useSaveExpense();
  useEffect(() => {
    if (context?.store) captured = { submit, store: context.store };
  }, [context?.store, submit]);
  return <span data-testid="ready">{context?.ready ? 'yes' : 'no'}</span>;
}

describe('useSaveExpense (store-backed)', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory();
    captured = null;
  });

  it('writes through the Local Store and queues an Outbox intent', async () => {
    render(
      <SpendtrackProvider
        seed={{ categories: [], expenses: [], budgets: [], recurring: [], user: { id: 'u-1' } }}
      >
        <Harness />
      </SpendtrackProvider>
    );

    await waitFor(() => expect(screen.getByTestId('ready')).toHaveTextContent('yes'));
    await waitFor(() => expect(captured).not.toBeNull());

    await act(async () => {
      await captured!.submit({ amount: '42', category_id: 'c-1', date: '2026-08-05' });
    });

    const expenses = await captured!.store.getExpenses();
    expect(expenses).toHaveLength(1);
    expect(expenses[0]?.amount).toBe(42);

    const outbox = await captured!.store.getOutbox();
    expect(outbox.map((entry) => entry.type)).toContain('expense.create');
  });
});
