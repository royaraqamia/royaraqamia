import { z } from 'zod';

import { createNotesService } from '@/backend/config/notes';
import { createPlanGate } from '@/backend/config/plans';
import { errorResultAt } from '@/backend/middleware/http';
import { OWNED_ITEMS } from '@/shared/contracts/plans';
import { messageError } from '@/backend/transport/authenticated-handler';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import type { NoteDeleteInput, NoteUpdateInput, NoteWriteInput } from '@/shared/contracts/notes';

/**
 * Notes' sync endpoints (ADR-0092).
 *
 * They back no server-rendered surface: `/notes` is a data-free shell that paints
 * from the Local Store, so nothing here revalidates a path. A guest writes to the
 * device only; these answer 401 without a session, and the client does not call
 * them then.
 */

const NoteIdSchema = z.string().uuid();

/** Offline write metadata an Outbox replay carries (ADR-0029). */
function offlineMeta(input: { clientId?: string | null; updatedAt?: string }): {
  clientId?: string;
  updatedAt?: string;
} {
  const meta: { clientId?: string; updatedAt?: string } = {};
  if (input.clientId) meta.clientId = input.clientId;
  if (input.updatedAt) meta.updatedAt = input.updatedAt;
  return meta;
}

/** The pull: everything the writer owns, from the cursor the device holds. */
export async function syncNotes(query: URLSearchParams): Promise<HttpResult> {
  const since = query.get('since');
  if (since && Number.isNaN(Date.parse(since))) {
    return jsonResult(400, { success: false, error: 'تاريخ المزامنة غير صالح.' });
  }

  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const snapshot = await createNotesService(supabase).getSyncSnapshot(userId, since);
      return jsonResult(200, snapshot);
    },
    { mapError: messageError(500, 'فشل مزامنة الملاحظات') }
  );
}

export async function createNote(input: NoteWriteInput): Promise<HttpResult> {
  const clientId = input.clientId;
  if (!clientId) {
    return jsonResult(400, { success: false, error: 'معرّف الملاحظة مطلوب.' });
  }

  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const service = createNotesService(supabase);
      const meta = offlineMeta(input);

      // A replay whose note is already live holds its slot; only a first write
      // (or a tombstone revival) checks the cap (ADR-0075).
      const existing = await service.getNote(userId, clientId);
      if (!existing || existing.deletedAt) {
        await createPlanGate().cap(userId, OWNED_ITEMS.notes);
      }

      await service.saveNote(
        userId,
        clientId,
        {
          body: input.body,
          ...(input.createdAt ? { createdAt: input.createdAt } : {}),
          deletedAt: null,
        },
        meta
      );

      return jsonResult(200, { success: true });
    },
    { mapError: errorResultAt(400, 'فشل حفظ الملاحظة') }
  );
}

export async function updateNote(id: string, input: NoteUpdateInput): Promise<HttpResult> {
  if (!NoteIdSchema.safeParse(id).success) {
    return jsonResult(400, { success: false, error: 'معرّف الملاحظة غير صالح.' });
  }

  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const service = createNotesService(supabase);
      const existing = await service.getNote(userId, id);

      // An edit that revives a tombstone takes a slot; one that lands on no row
      // at all would insert one, so it is checked the same way (ADR-0075). A
      // delete replay takes no slot.
      const revives = !existing || Boolean(existing.deletedAt);
      if (revives && input.deletedAt !== null) {
        await createPlanGate().cap(userId, OWNED_ITEMS.notes);
      }

      await service.saveNote(
        userId,
        id,
        {
          body: input.body ?? existing?.body ?? '',
          ...('deletedAt' in input ? { deletedAt: input.deletedAt ?? null } : {}),
        },
        offlineMeta(input)
      );

      return jsonResult(200, { success: true });
    },
    { mapError: errorResultAt(400, 'فشل تحديث الملاحظة') }
  );
}

export async function deleteNote(id: string, input: NoteDeleteInput): Promise<HttpResult> {
  if (!NoteIdSchema.safeParse(id).success) {
    return jsonResult(400, { success: false, error: 'معرّف الملاحظة غير صالح.' });
  }

  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      await createNotesService(supabase).deleteNote(userId, id, offlineMeta(input));
      return jsonResult(200, { success: true });
    },
    { mapError: errorResultAt(400, 'فشل حذف الملاحظة') }
  );
}
