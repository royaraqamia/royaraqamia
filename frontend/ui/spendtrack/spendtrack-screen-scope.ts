import type { ScreenScope } from '@/frontend/state/screen-scopes';
import type { ScreenFieldCandidate } from '@/shared/contracts/screen-context-fields';

/**
 * What SpendTrack registers (ADR-0181, #1420).
 *
 * The expense form is the question this program was opened for — "what is wrong
 * with this form?" — so it is the one surface whose fields are readable: the
 * allowlist in `screen-context-fields.ts` names exactly these five, and the
 * member's own amount, category, date, description and currency are the subject,
 * not a secret. Everything else the surface holds (the store's rows, the budget,
 * the account) is not a candidate.
 */
const EXPENSE_FIELDS = ['amount', 'category_id', 'date', 'description', 'currency'] as const;

const CATEGORY_FIELDS = ['name', 'colorHex'] as const;

/** The dashboard's own chip: the range the totals are counted over. */
export function spendtrackScreenScope(range: string): ScreenScope {
  return { id: 'spendtrack.page', kind: 'screen', tab: range };
}

/** The categories page: the list of rows the member edits. */
export function spendtrackCategoriesScreenScope(): ScreenScope {
  return { id: 'spendtrack-categories.page', kind: 'screen' };
}

/** A form's values as candidates; the allowlist decides what survives. */
function candidates(
  names: readonly string[],
  values: Readonly<Record<string, unknown>>
): ScreenFieldCandidate[] {
  return names.map((name) => ({ name, value: String(values[name] ?? '') }));
}

/** The create or edit expense dialog, with the row it edits. */
export function spendtrackExpenseScope(
  values: Readonly<Record<string, unknown>>,
  expenseId: string | null = null
): ScreenScope {
  return {
    id: 'spendtrack.expense',
    kind: 'dialog',
    focus: expenseId ? { kind: 'expense', id: expenseId } : null,
    fields: candidates(EXPENSE_FIELDS, values),
  };
}

/** The create or edit category dialog, with the row it edits. */
export function spendtrackCategoryScope(
  values: Readonly<Record<string, unknown>>,
  categoryId: string | null = null
): ScreenScope {
  return {
    id: 'spendtrack-categories.category',
    kind: 'dialog',
    focus: categoryId ? { kind: 'category', id: categoryId } : null,
    fields: candidates(CATEGORY_FIELDS, values),
  };
}
