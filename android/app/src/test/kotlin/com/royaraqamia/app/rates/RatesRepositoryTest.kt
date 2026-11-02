package com.royaraqamia.app.rates

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.session.MemoryTokenStore
import com.royaraqamia.app.session.RefreshOutcome
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.TokenRefresher
import com.royaraqamia.app.store.MemoryIdentityStorage
import com.royaraqamia.app.support.RecordingTransport
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder
import java.io.IOException

/**
 * The snapshot the matrix promises for `/rates` (#658).
 *
 * The page the worker caches keeps painting its last numbers with the radio off, so
 * the app must not be the client that says "nothing to show" where the browser
 * shows yesterday's board. What is asserted here is the order of the two facts: a
 * board the server answered is kept, and only a read that failed may fall back to
 * it — a kept board is never preferred over a live one, and one the contract can no
 * longer read is not a board.
 */
class RatesRepositoryTest {
    @get:Rule val temporary = TemporaryFolder()

    private val body =
        """
        {
          "base": "USD",
          "fetchedAt": "2026-11-01T06:00:00.000Z",
          "providerQuoteDate": "2026-10-31",
          "isStale": false,
          "currencies": [
            {
              "code": "SYP",
              "name": "اللِّيرة السُّوريَّة",
              "symbol": "ل.س",
              "rate": 13000,
              "previousRate": null,
              "changePct": null,
              "asOf": "2026-10-31",
              "parallel": null
            }
          ],
          "metals": []
        }
        """.trimIndent()

    private fun guest(): Session =
        Session(
            MemoryTokenStore(),
            object : TokenRefresher {
                override suspend fun refresh(refreshToken: String) = RefreshOutcome.Refused
            },
            MemoryIdentityStorage(),
        )

    private fun repository(transport: RecordingTransport, store: RatesSnapshotStore) =
        RatesRepository(ApiClient("https://app.test", guest(), transport), store)

    private fun store(): RatesSnapshotStore = RatesSnapshotStore(temporary.newFolder("rates"))

    @Test
    fun `a board the server answered is live and kept for later`() {
        val transport = RecordingTransport { HttpResponse(200, body) }
        val snapshot = store()

        val result = runBlocking { repository(transport, snapshot).board() }

        assertTrue(result is RatesResult.Live)
        assertEquals("USD", (result as RatesResult.Live).board.base)
        val kept = snapshot.read()
        assertNotNull("the read is kept", kept)
        assertTrue("the kept body is the board", kept!!.contains("\"SYP\""))

        val request = transport.requests.single()
        assertEquals("GET", request.method)
        assertEquals("https://app.test/api/rates/board", request.url)
        assertNull("a public read carries no token", request.bearer)
    }

    @Test
    fun `a read that never reached the server falls back to the kept board`() {
        val kept = store().also { it.save(body) }
        val transport = RecordingTransport { throw IOException("offline") }

        val result = runBlocking { repository(transport, kept).board() }

        assertTrue(result is RatesResult.Snapshot)
        assertEquals("USD", (result as RatesResult.Snapshot).board.base)
    }

    @Test
    fun `a refusal is answered from the kept board too`() {
        val kept = store().also { it.save(body) }
        val transport = RecordingTransport { HttpResponse(503, "maintenance") }

        val result = runBlocking { repository(transport, kept).board() }

        assertTrue(result is RatesResult.Snapshot)
    }

    @Test
    fun `with nothing kept there is nothing to show`() {
        val transport = RecordingTransport { throw IOException("offline") }

        val result = runBlocking { repository(transport, store()).board() }

        assertEquals(RatesResult.Unavailable, result)
    }

    @Test
    fun `a kept file the contract can no longer read is not a board`() {
        val stale = store().also { it.save("""{"base":"USD"}""") }
        val transport = RecordingTransport { throw IOException("offline") }

        val result = runBlocking { repository(transport, stale).board() }

        assertEquals(RatesResult.Unavailable, result)
    }

    @Test
    fun `a live read replaces the kept board rather than adding to it`() {
        val snapshot = store().also { it.save("""{"base":"OLD"}""") }
        val transport = RecordingTransport { HttpResponse(200, body) }

        val result = runBlocking { repository(transport, snapshot).board() }

        assertTrue(result is RatesResult.Live)
        val kept = snapshot.read()
        assertTrue(kept!!.contains("\"USD\""))
        assertEquals("one file, not an archive", 1, temporary.root.listFiles()!!.size)
    }
}

/** The file the snapshot lives in: written atomically, read only when present. */
class RatesSnapshotStoreTest {
    @get:Rule val temporary = TemporaryFolder()

    @Test
    fun `a saved body is the body that comes back`() {
        val store = RatesSnapshotStore(temporary.newFolder("rates"))
        store.save("""{"base":"USD"}""")

        assertEquals("""{"base":"USD"}""", store.read())
    }

    @Test
    fun `a second save replaces the first`() {
        val directory = temporary.newFolder("rates")
        val store = RatesSnapshotStore(directory)
        store.save("""{"base":"USD"}""")
        store.save("""{"base":"SAR"}""")

        assertEquals("""{"base":"SAR"}""", store.read())
        assertEquals("the temporary file is not left behind", 1, directory.listFiles()!!.size)
    }

    @Test
    fun `an empty directory reads as no snapshot`() {
        assertNull(RatesSnapshotStore(temporary.newFolder("rates")).read())
    }

    @Test
    fun `clearing drops the snapshot`() {
        val store = RatesSnapshotStore(temporary.newFolder("rates"))
        store.save("""{"base":"USD"}""")
        store.clear()

        assertNull(store.read())
    }
}
