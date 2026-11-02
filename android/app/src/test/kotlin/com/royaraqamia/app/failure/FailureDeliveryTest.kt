package com.royaraqamia.app.failure

import com.royaraqamia.app.contracts.generated.AppFailureReport
import com.royaraqamia.app.contracts.generated.AppFailureReportKind
import com.royaraqamia.app.contracts.generated.AppFailureReportReason
import com.royaraqamia.app.contracts.generated.AppFailureReportShell
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.net.Transport
import java.io.File
import java.io.IOException
import java.nio.file.Files
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * What a delivery pass does with each answer (#667): send, keep or drop.
 *
 * The three behaviours are the whole reason the queue exists. A report kept when
 * the radio is off is the "reported when one returns" criterion; a report
 * dropped on a body the server will never accept is what keeps a bad build from
 * blocking the queue behind it forever.
 */
class FailureDeliveryTest {
    private val directory: File = Files.createTempDirectory("roy-delivery").toFile()
    private val queue = FailureQueue(directory, now = { 1_700_000_000_000L })

    private class FakeTransport(
        private val answer: (String) -> HttpResponse,
        private val offline: Boolean = false,
    ) : Transport {
        val calls = mutableListOf<Triple<String, String, String?>>()

        override fun send(
            method: String,
            url: String,
            headers: Map<String, String>,
            body: String?,
        ): HttpResponse {
            if (offline) throw IOException("no radio")
            calls += Triple(method, url, body)
            return answer(body.orEmpty())
        }
    }

    @After
    fun tearDown() {
        directory.deleteRecursively()
    }

    private fun report(at: Long = 1_700_000_000_000L): AppFailureReport =
        AppFailureReport(
            version = 1.0,
            kind = AppFailureReportKind.CRASH,
            reason = AppFailureReportReason.UNCAUGHT,
            signature = "java.lang.IllegalStateException",
            shell = AppFailureReportShell("1.0.21", 20_021),
            contracts = "05eb4c086b1b",
            frames = listOf("com.royaraqamia.app.Shell.onCreate(Shell.kt:9)"),
            at = at,
        )

    @Test
    fun `a report is posted to the site's own route, as its file says`() {
        queue.add(report())
        val transport = FakeTransport({ HttpResponse(200, "{\"success\":true}") })

        FailureDelivery.drain(queue, "https://royaraqamia.com/", transport)

        assertEquals(1, transport.calls.size)
        val (method, url, body) = transport.calls.single()
        assertEquals("POST", method)
        assertEquals("https://royaraqamia.com/api/app-failures", url)
        assertTrue(body.orEmpty().contains("05eb4c086b1b"))
    }

    @Test
    fun `an accepted report leaves the queue`() {
        queue.add(report())
        val outcome =
            FailureDelivery.drain(queue, "https://x.test", FakeTransport({ HttpResponse(200, "") }))

        assertEquals(DeliveryOutcome(sent = 1, dropped = 0, left = 0), outcome)
        assertTrue(queue.pending().isEmpty())
    }

    @Test
    fun `a report the server will never accept is dropped`() {
        queue.add(report())
        val outcome =
            FailureDelivery.drain(queue, "https://x.test", FakeTransport({ HttpResponse(400, "") }))

        assertEquals(DeliveryOutcome(sent = 0, dropped = 1, left = 0), outcome)
        assertTrue(queue.pending().isEmpty())
    }

    @Test
    fun `a body is kept while the server says not now`() {
        for (status in listOf(429, 500, 503)) {
            queue.add(report())
            val outcome =
                FailureDelivery.drain(
                    queue,
                    "https://x.test",
                    FakeTransport({ HttpResponse(status, "") }),
                )

            assertTrue("status $status should retry", outcome.left > 0)
            assertEquals(1, queue.pending().size)
            queue.pending().forEach { queue.remove(it.file) }
        }
    }

    @Test
    fun `a report queued with no radio is sent when one returns`() {
        queue.add(report())

        val offline = FailureDelivery.drain(queue, "https://x.test", FakeTransport({ HttpResponse(200, "") }, offline = true))
        assertEquals(1, offline.left)
        assertEquals(1, queue.pending().size)

        val online = FailureDelivery.drain(queue, "https://x.test", FakeTransport({ HttpResponse(200, "") }))
        assertEquals(DeliveryOutcome(sent = 1, dropped = 0, left = 0), online)
        assertTrue(queue.pending().isEmpty())
    }

    @Test
    fun `an empty queue spends no request`() {
        val transport = FakeTransport({ HttpResponse(200, "") })

        val outcome = FailureDelivery.drain(queue, "https://x.test", transport)

        assertEquals(DeliveryOutcome(0, 0, 0), outcome)
        assertTrue(transport.calls.isEmpty())
    }
}
