package com.royaraqamia.app.quran

import com.royaraqamia.app.store.outbox.OutboxIntentRow
import com.royaraqamia.app.store.outbox.WriteRequest
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * A queued reader write as the request the web's outbox sends (#1751).
 *
 * The two paths are the ones `frontend/api/quran/sync-transport.ts` already
 * drains to, so the server keeps one implementation and the two clients cannot
 * disagree about what a mark or a new reading place is. Payloads are the
 * generated wire types, encoded with explicit nulls so a tombstone travels as
 * `deletedAt: null` just as the web sends it.
 */
object QuranWriteTransport {
    const val POSITION_PATH = "/quran/api/position"
    const val BOOKMARKS_PATH = "/quran/api/bookmarks"

    /** Explicit nulls: a tombstone travels as `null`, as the web's does. */
    val json = Json { explicitNulls = true; encodeDefaults = true }

    fun requestFor(intent: OutboxIntentRow): WriteRequest =
        when (intent.type) {
            QuranOwnDao.POSITION_INTENT -> WriteRequest("POST", POSITION_PATH, intent.payload)
            QuranOwnDao.BOOKMARK_INTENT -> WriteRequest("POST", BOOKMARKS_PATH, intent.payload)
            else -> throw IllegalArgumentException("Unknown quran outbox intent: ${intent.type}")
        }

    fun positionPayload(
        surah: Int,
        ayah: Int,
        clientId: String,
        updatedAt: String,
    ): String = json.encodeToString(QuranPositionWriteWire(surah, ayah, clientId, updatedAt))

    fun bookmarkPayload(
        surah: Int,
        ayah: Int,
        clientId: String,
        updatedAt: String,
        deletedAt: String?,
    ): String =
        json.encodeToString(
            QuranBookmarkWriteWire(surah, ayah, deletedAt, clientId, updatedAt)
        )
}
