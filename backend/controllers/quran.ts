import { createQuranSyncService } from '@/backend/config/quran';
import { createPlanGate } from '@/backend/config/plans';
import { errorResultAt } from '@/backend/middleware/http';
import { OWNED_ITEMS } from '@/shared/contracts/plans';
import { messageError } from '@/backend/transport/authenticated-handler';
import { jsonResult, type HttpResult } from '@/backend/transport/http-result';
import { withAuthenticatedUser } from '@/backend/transport/session-handler';
import type { QuranBookmarkWrite, QuranPositionWrite } from '@/shared/contracts/quran';

/**
 * The Quran's sync endpoints (ADR-0056, P1b).
 *
 * They back no server-rendered surface: the reader paints from the Local Store
 * and these routes only carry the two owned records to and from the account, so
 * nothing here revalidates a path. Reading stays anonymous; these answer 401
 * without a session, and the client simply does not call them then.
 */

/** The pull: everything the reader owns, from the cursor the device holds. */
export async function syncQuran(query: URLSearchParams): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      const snapshot = await createQuranSyncService(supabase).getSyncSnapshot(
        userId,
        query.get('since')
      );
      return jsonResult(200, snapshot);
    },
    { mapError: messageError(500, 'فشل مزامنة بيانات القرآن') }
  );
}

export async function saveQuranReadingPosition(body: QuranPositionWrite): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      await createQuranSyncService(supabase).saveReadingPosition(
        userId,
        { surah: body.surah, ayah: body.ayah },
        { clientId: body.clientId, updatedAt: body.updatedAt }
      );
      return jsonResult(200, { success: true });
    },
    { mapError: messageError(400, 'فشل حفظ موضع القراءة') }
  );
}

export async function saveQuranBookmark(body: QuranBookmarkWrite): Promise<HttpResult> {
  return withAuthenticatedUser(
    async ({ userId, supabase }) => {
      // A mark takes a slot; clearing one (a tombstone) gives it back.
      if (!body.deletedAt) {
        await createPlanGate().cap(userId, OWNED_ITEMS.quranBookmarks);
      }

      await createQuranSyncService(supabase).setBookmark(
        userId,
        { surah: body.surah, ayah: body.ayah, deletedAt: body.deletedAt ?? null },
        { clientId: body.clientId, updatedAt: body.updatedAt }
      );
      return jsonResult(200, { success: true });
    },
    { mapError: errorResultAt(400, 'فشل حفظ العلامة') }
  );
}
