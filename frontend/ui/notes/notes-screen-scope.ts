import type { ScreenScope } from '@/frontend/state/screen-scopes';
import type { Note } from '@/shared/contracts/notes';

/**
 * What `/notes` registers (ADR-0181, #1420).
 *
 * The list registers itself; the editor registers the note it has open and hands
 * the body over as a candidate the allowlist refuses — an unsent draft is
 * invisible by decision (decision 4), and the policy row for `notes` is what
 * makes that auditable.
 */
export function notesScreenScope(): ScreenScope {
  return { id: 'notes.page', kind: 'screen' };
}

export function notesEditorScope(note: Pick<Note, 'id' | 'body'> | null): ScreenScope | null {
  if (!note) return null;
  return {
    id: 'notes.editor',
    kind: 'dialog',
    focus: { kind: 'note', id: note.id },
    fields: [{ name: 'body', value: note.body }],
  };
}
