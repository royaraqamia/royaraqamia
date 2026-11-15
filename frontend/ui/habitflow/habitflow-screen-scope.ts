import type { ScreenScope } from '@/frontend/state/screen-scopes';

/**
 * What `/habitflow` registers (ADR-0181, #1420).
 *
 * The habit in hand is the record: the edit form names one habit, and a member
 * asking "why does this habit look wrong?" is asking about that row. The form's
 * own fields stay out — a habit's name and target are the member's, and this
 * surface has no allowlist for them — so the registration carries the id and the
 * dialog, never the text.
 */
export function habitflowScreenScope(habitId: string | null): ScreenScope {
  return {
    id: 'habitflow.page',
    kind: 'screen',
    focus: habitId ? { kind: 'habit', id: habitId } : null,
  };
}

/** The add or edit dialog above the dashboard, and the habit it edits. */
export function habitflowHabitScope(open: boolean, habitId: string | null): ScreenScope | null {
  if (!open) return null;
  return {
    id: 'habitflow.habit',
    kind: 'dialog',
    focus: habitId ? { kind: 'habit', id: habitId } : null,
  };
}
