package com.royaraqamia.app.rates

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.session.MemoryTokenStore
import com.royaraqamia.app.session.RefreshOutcome
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.TokenRefresher
import com.royaraqamia.app.store.MemoryIdentityStorage
import com.royaraqamia.app.store.PublicSnapshotStore
import com.royaraqamia.app.support.RecordingTransport
import java.io.IOException
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.rules.TemporaryFolder

/**
 * The snapshot the shared public-surface rule promises for `/rates` (#658, #928).
 *
 * The rule (`docs/specs/offline-first.md`) is the same for every public surface:
 * a board the server answered is kept, and only a read that failed may fall back
 * to it — a kept board is never preferred over a live one, and one the contract
 * can no longer read is not a board. The store is shared with the feed, so the
 * test also proves the surface key is what keeps the two apart.
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

    private fun repository(transport: RecordingTransport, store: PublicSnapshotStore) =
        RatesRepository(ApiClient("https://app.test", guest(), transport), store)

    private fun store(): PublicSnapshotStore = PublicSnapshotStore(temporary.newFolder("public"))

    @Test
    fun `a board the server answered is live and kept for later`() {
        val transport = RecordingTransport { HttpResponse(200, body) }
        val snapshot = store()

        val result = runBlocking { repository(transport, snapshot).board() }

        assertTrue(result is RatesResult.Live)
        assertEquals("USD", (result as RatesResult.Live).board.base)
        val kept = snapshot.read(RatesRepository.SNAPSHOT_SURFACE)
        assertNotNull("the read is kept", kept)
        assertTrue("the kept body is the board", kept!!.contains("\"SYP\""))

        val request = transport.requests.single()
        assertEquals("GET", request.method)
        assertEquals("https://app.test/api/rates/board", request.url)
        assertNull("a public read carries no token", request.bearer)
    }

    @Test
    fun `a read that never reached the server falls back to the kept board`() {
        val kept = store().also { it.save(RatesRepository.SNAPSHOT_SURFACE, body) }
        val transport = RecordingTransport { throw IOException("offline") }

        val result = runBlocking { repository(transport, kept).board() }

        assertTrue(result is RatesResult.Snapshot)
        assertEquals("USD", (result as RatesResult.Snapshot).board.base)
    }

    @Test
    fun `a refusal is answered from the kept board too`() {
        val kept = store().also { it.save(RatesRepository.SNAPSHOT_SURFACE, body) }
        val transport = RecordingTransport { HttpResponse(503, "maintenance") }

        val result = runBlocking { repository(transport, kept).board() }

        assertTrue(result is RatesResult.Snapshot)
    }

    @Test
    fun `with nothing kept there is nothing to show, and the failure is kept`() {
        val transport = RecordingTransport { throw IOException("offline") }

        val result = runBlocking { repository(transport, store()).board() }

        assertTrue(result is RatesResult.Unavailable)
        assertTrue((result as RatesResult.Unavailable).error is ApiError.Network)
    }

    @Test
    fun `a kept file the contract can no longer read is not a board`() {
        val stale = store().also { it.save(RatesRepository.SNAPSHOT_SURFACE, """{"base":"USD"}""") }
        val transport = RecordingTransport { throw IOException("offline") }

        val result = runBlocking { repository(transport, stale).board() }

        assertTrue(result is RatesResult.Unavailable)
    }

    @Test
    fun `a live read replaces the kept board rather than adding to it`() {
        val folder = temporary.newFolder("public")
        val snapshot = PublicSnapshotStore(folder)
        snapshot.save(RatesRepository.SNAPSHOT_SURFACE, """{"base":"OLD"}""")
        val transport = RecordingTransport { HttpResponse(200, body) }

        val result = runBlocking { repository(transport, snapshot).board() }

        assertTrue(result is RatesResult.Live)
        val kept = snapshot.read(RatesRepository.SNAPSHOT_SURFACE)
        assertTrue(kept!!.contains("\"USD\""))
        assertEquals("one file, not an archive", 1, folder.listFiles()!!.size)
    }

    @Test
    fun `a request that never left is offline, a refusal is not`() {
        assertEquals(
            RatesUiState.Unavailable(offline = true),
            RatesUiState.of(RatesResult.Unavailable(ApiError.Network("offline"))),
        )
        val refused = RatesUiState.of(RatesResult.Unavailable(ApiError.Server(500, "boom")))
        assertTrue(refused is RatesUiState.Unavailable)
        assertFalse((refused as RatesUiState.Unavailable).offline)
    }
}
