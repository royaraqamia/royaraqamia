'use client';

import '@/app/notes/app.css';
import { NotesPageClient } from '@/frontend/ui/notes/notes-page-client';

/**
 * The notes surface, without the route frame: the route draws it inside its
 * layout, and the homepage under the strip (ADR-0151).
 *
 * `embedded` keeps the open note in state and out of the address bar, because
 * the tab's address is `/`.
 */
export function NotesSurface({ embedded = false }: { embedded?: boolean }) {
  return (
    <div className="space-y-6 pb-8">
      <NotesPageClient embedded={embedded} />
    </div>
  );
}
