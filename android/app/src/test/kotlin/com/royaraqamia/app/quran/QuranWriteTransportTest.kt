package com.royaraqamia.app.quran

import com.royaraqamia.app.store.outbox.OutboxIntentRow
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The reader's writes are the web's writes (#1751): one client id for every
 * replay, and a tombstone that travels as a null so an unmark can reach another
 * device. Both are checked here at the payload, before an Outbox has to exist.
 */
class QuranWriteTransportTest {
    private val stamp = "2026-11-25T12:00:00.000Z"

    @Test
    fun `a position write carries the client id and the place`() {
        val payload = QuranWriteTransport.positionPayload(2, 3, CLIENT_ID, stamp)
        assertTrue(payload.contains("\"surah\":2"))
        assertTrue(payload.contains("\"ayah\":3"))
        assertTrue(payload.contains("\"clientId\":\"$CLIENT_ID\""))
        assertTrue(payload.contains("\"updatedAt\":\"$stamp\""))
    }

    @Test
    fun `a mark writes null as a tombstone, not an omitted field`() {
        val marked = QuranWriteTransport.bookmarkPayload(2, 3, CLIENT_ID, stamp, null)
        val unmarked = QuranWriteTransport.bookmarkPayload(2, 3, CLIENT_ID, stamp, stamp)
        assertTrue(marked.contains("\"deletedAt\":null"))
        assertTrue(unmarked.contains("\"deletedAt\":\"$stamp\""))
    }

    @Test
    fun `each intent posts to the route the site drains to`() {
        val position =
            OutboxIntentRow.pending("id", "quran", QuranOwnDao.POSITION_INTENT, "{}", 0)
        val bookmark =
            OutboxIntentRow.pending("id", "quran", QuranOwnDao.BOOKMARK_INTENT, "{}", 0)
        assertEquals("POST", QuranWriteTransport.requestFor(position).method)
        assertEquals(QuranWriteTransport.POSITION_PATH, QuranWriteTransport.requestFor(position).path)
        assertEquals(QuranWriteTransport.BOOKMARKS_PATH, QuranWriteTransport.requestFor(bookmark).path)
    }

    private companion object {
        const val CLIENT_ID = "018f1f5e-7c2a-7d1f-8f0e-3f6b7a1c9d02"
    }
}
