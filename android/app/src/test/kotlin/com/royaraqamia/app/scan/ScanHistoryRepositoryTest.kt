package com.royaraqamia.app.scan

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.session.MemoryTokenStore
import com.royaraqamia.app.session.RefreshOutcome
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.TokenPair
import com.royaraqamia.app.session.TokenRefresher
import com.royaraqamia.app.store.MemoryIdentityStorage
import com.royaraqamia.app.support.RecordingTransport
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The app's read of the scan history (#1430, ADR-0205).
 *
 * The record the screen sends is the page's record: three fields, no payload.
 * The list is the server's answer, so the phone never invents a count or a day.
 */
class ScanHistoryRepositoryTest {
    private val listBody =
        """
        {
          "success": true,
          "entries": [
            {
              "id": "row-1",
              "kind": "link",
              "format": "qr_code",
              "label": "cafe.example",
              "lastSeenDate": "2026/12/12",
              "lastSeenAt": "2026-12-12T20:30:00.000Z",
              "seenCount": 3
            }
          ]
        }
        """.trimIndent()

    private fun repository(transport: RecordingTransport): ScanHistoryRepository {
        val session =
            Session(
                MemoryTokenStore("refresh-1"),
                TokenRefresher { RefreshOutcome.Refused },
                MemoryIdentityStorage(),
            )
        runBlocking { session.signIn(TokenPair("access-1", "refresh-1", "user-1")) }
        return ScanHistoryRepository(ApiClient("https://app.test", session, transport))
    }

    @Test
    fun `reads the member's rows from the page's route`() {
        val transport = RecordingTransport { HttpResponse(200, listBody) }

        val result = runBlocking { repository(transport).read() }

        assertTrue(result is ApiResult.Success)
        val entries = (result as ApiResult.Success).value
        assertEquals(1, entries.size)
        assertEquals("cafe.example", entries[0].label)
        assertEquals(ScanResultKind.Link, entries[0].kind)
        assertEquals("2026/12/12", entries[0].lastSeenDate)
        assertEquals(3L, entries[0].seenCount)
        assertEquals("/api/scan/history", transport.requests.single().url.substringAfter("app.test"))
        assertEquals("Bearer access-1", transport.requests.single().bearer)
    }

    @Test
    fun `a refused read is a failure, not an empty history`() {
        val transport =
            RecordingTransport { HttpResponse(200, """{"success":false,"error":"no"}""") }

        assertTrue(runBlocking { repository(transport).read() } is ApiResult.Failure)
    }

    @Test
    fun `the write carries the summary and never the payload`() {
        val transport =
            RecordingTransport { HttpResponse(200, """{"success":true,"entry":null}""") }
        val summary =
            ScanHistorySummary.of(
                ScanClassifier.classify("WIFI:T:WPA;S:CafeGuest;P:hunter2-secret;;"),
                "QR_CODE",
            )

        val result = runBlocking { repository(transport).record(summary) }
        val sent = transport.requests.single()

        assertTrue(result is ApiResult.Success)
        assertEquals("POST", sent.method)
        assertTrue(sent.body.orEmpty().contains("CafeGuest"))
        assertFalse(sent.body.orEmpty().contains("hunter2-secret"))
        assertFalse(sent.body.orEmpty().contains("WIFI:"))
    }

    @Test
    fun `the clear says how many rows went`() {
        val transport =
            RecordingTransport { HttpResponse(200, """{"success":true,"cleared":2}""") }

        val result = runBlocking { repository(transport).clear() }

        assertEquals(2L, (result as ApiResult.Success).value)
        assertEquals("DELETE", transport.requests.single().method)
    }

    @Test
    fun `not signed in is not a network failure`() {
        val transport = RecordingTransport { HttpResponse(200, listBody) }
        val session =
            Session(
                MemoryTokenStore(),
                TokenRefresher { RefreshOutcome.Refused },
                MemoryIdentityStorage(),
            )
        val repository = ScanHistoryRepository(ApiClient("https://app.test", session, transport))

        val result = runBlocking { repository.read() }

        assertTrue(result is ApiResult.Failure)
        assertEquals(ApiError.NotSignedIn, (result as ApiResult.Failure).error)
        assertEquals(0, transport.hits)
    }
}
