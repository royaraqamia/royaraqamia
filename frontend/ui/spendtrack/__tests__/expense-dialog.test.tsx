import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { Category, Expense } from '@/shared/contracts/spendtrack';
import { resetOverlayBackForTests } from '@/frontend/ui/primitives/overlay-back';
import { SPENDTRACK_EXPENSE_DIALOG_COPY } from '../spendtrack-expense-dialog-copy';
import { EditExpenseDialog } from '../expense-dialog';

const submit = vi.hoisted(() => vi.fn());

vi.mock('@/frontend/state/spendtrack/use-expenses', () => ({
  useSaveExpense: () => ({ submit, pending: false, serverError: undefined }),
}));

const CATEGORIES: Category[] = [
  {
    id: 'cat-food',
    user_id: 'user-1',
    name: 'Food',
    colorHex: '#f97316',
    created_at: '2026-11-01T00:00:00.000Z',
  },
];

/**
 * One row of the offline list. The list keys it by `id`, so the dialog instance
 * survives the refresh a save triggers and its `expense` prop changes under it.
 */
function expenseRow(amount: number, description: string | null = null): Expense {
  return {
    id: 'expense-1',
    user_id: 'user-1',
    category_id: 'cat-food',
    amount,
    description,
    date: '2026-11-01',
    created_at: '2026-11-01T09:00:00.000Z',
    updated_at: '2026-11-01T09:00:00.000Z',
  };
}

function amountInput(): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(
    '[data-visual="spendtrack-expense-amount"]'
  );
  if (!input) throw new Error('the edit dialog is not showing an amount field');
  return input;
}

function openDialog(): void {
  fireEvent.click(screen.getByRole('button', { name: SPENDTRACK_EXPENSE_DIALOG_COPY.editTitle }));
}

function clickSave(): void {
  fireEvent.click(screen.getByRole('button', { name: SPENDTRACK_EXPENSE_DIALOG_COPY.save }));
}

function renderRow(expense: Expense) {
  return render(<EditExpenseDialog expense={expense} categories={CATEGORIES} currency="USD" />);
}

beforeEach(async () => {
  submit.mockReset();
  resetOverlayBackForTests();
  window.history.replaceState({}, '', '/');
  // A closed dialog from the previous case may still have a history traversal
  // in flight; let it land on an empty stack, not on this case's dialog.
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

// #1075: a save refreshes the row while the dialog stays mounted, so reopening
// it used to show the amount the row had before the edit.
describe('the edit dialog after a save', () => {
  it('shows the saved amount when the same row is reopened', async () => {
    submit.mockResolvedValue(true);
    const { rerender } = renderRow(expenseRow(10));

    openDialog();
    fireEvent.change(amountInput(), { target: { value: '20' } });
    clickSave();

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: SPENDTRACK_EXPENSE_DIALOG_COPY.save })).toBeNull()
    );

    rerender(<EditExpenseDialog expense={expenseRow(20)} categories={CATEGORIES} currency="USD" />);

    openDialog();
    expect(amountInput().value).toBe('20');
  });

  it('keeps the saved amount when a later edit only changes the description', async () => {
    submit.mockResolvedValue(true);
    const { rerender } = renderRow(expenseRow(10));

    openDialog();
    fireEvent.change(amountInput(), { target: { value: '20' } });
    clickSave();
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: SPENDTRACK_EXPENSE_DIALOG_COPY.save })).toBeNull()
    );

    rerender(<EditExpenseDialog expense={expenseRow(20)} categories={CATEGORIES} currency="USD" />);

    openDialog();
    fireEvent.change(
      screen.getByLabelText(new RegExp(SPENDTRACK_EXPENSE_DIALOG_COPY.descriptionLabel)),
      {
        target: { value: 'coffee' },
      }
    );
    clickSave();

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(2));
    expect(submit).toHaveBeenLastCalledWith(
      expect.objectContaining({ amount: '20', description: 'coffee' })
    );
  });
});

describe('the edit dialog after a failed save', () => {
  it('stays open with the values the user typed', async () => {
    submit.mockResolvedValue(false);
    renderRow(expenseRow(10));

    openDialog();
    fireEvent.change(amountInput(), { target: { value: '35' } });
    clickSave();

    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(amountInput().value).toBe('35');
    screen.getByRole('button', { name: SPENDTRACK_EXPENSE_DIALOG_COPY.save });
  });
});
