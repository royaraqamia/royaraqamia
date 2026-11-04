package com.royaraqamia.app.store.leads

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.session.MemoryTokenStore
import com.royaraqamia.app.session.RefreshOutcome
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.TokenPair
import com.royaraqamia.app.session.TokenRefresher
import com.royaraqamia.app.store.Identity
import com.royaraqamia.app.store.MemoryIdentityStorage
import com.royaraqamia.app.store.outbox.WriteClock
import com.royaraqamia.app.support.RecordingTransport
import java.io.IOException
import java.util.Locale
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * A lead, from the tap to the server (#929).
 *
 * JVM tests against a real SQLite file (Robolectric), because the acceptance is
 * about delivery: a submission made with the radio off is on disk before the
 * form says "queued", it survives the process, and it is removed only once the
 * server has answered with a reference code. A fake store would prove only that
 * the fake queues.
 */
@RunWith(RobolectricTestRunner::class)
class LeadsWritesTest {
    private lateinit var context: Context
    private lateinit var stores: LeadsStores

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        stores = LeadsStores.open(context)
    }

    @After
    fun tearDown() {
        stores.close()
        context.deleteDatabase(LeadsDatabase.fileName())
    }

    @Test
    fun `an online submission is sent and its reference code kept`() = runBlocking {
        val transport = RecordingTransport {
            HttpResponse(200, """{"success":true,"referenceCode":"TRN-2026-ABCDEFGH"}""")
        }
        val repository = repository(transport, signedIn = true)

        val outcome = repository.submit(LeadKind.Training, validTraining())

        assertEquals(LeadSubmitOutcome.Sent("TRN-2026-ABCDEFGH"), outcome)
        assertEquals("the code survives on the device", "TRN-2026-ABCDEFGH", repository.receipt(LeadKind.Training))
        assertEquals(0, repository.outboxStatus().pending)
        val sent = transport.requests.single()
        assertEquals("POST", sent.method)
        assertTrue(sent.url, sent.url.endsWith("/api/training/applications"))
        assertTrue("a signed-in lead carries the bearer", sent.bearer != null)
    }

    @Test
    fun `a guest's lead drains publicly, with no bearer`() = runBlocking {
        val transport = RecordingTransport {
            HttpResponse(200, """{"success":true,"referenceCode":"PRJ-2026-ABCDEFGH"}""")
        }
        val repository = repository(transport, signedIn = false)

        assertEquals(LeadSubmitOutcome.Sent("PRJ-2026-ABCDEFGH"), repository.submit(LeadKind.ProjectRequest, validProject()))

        val sent = transport.requests.single()
        assertNull("an anonymous lead sends no token", sent.bearer)
        assertTrue(sent.url, sent.url.endsWith("/api/project-requests"))
    }

    @Test
    fun `a submission with the radio off is queued, and survives a process kill`() = runBlocking {
        var online = false
        val before = repository(transport = RecordingTransport { HttpResponse(200, "{}") }, online = { online })

        assertEquals(LeadSubmitOutcome.Queued, before.submit(LeadKind.Retainer, validRetainer()))
        assertEquals("the queue is durable", 1, before.outboxStatus().pending)

        // The process dies: the connection goes, the file does not.
        stores.close()
        stores = LeadsStores.open(context)
        online = true

        val transport = RecordingTransport {
            HttpResponse(200, """{"success":true,"referenceCode":"RET-2026-ABCDEFGH"}""")
        }
        val after = repository(transport, online = { online })

        assertEquals(1, after.outboxStatus().pending)
        val report = after.drain()

        assertEquals(1, report.replayed)
        assertEquals(0, report.pending)
        val sent = transport.requests.single()
        assertTrue(sent.url, sent.url.endsWith("/api/retainers"))
        assertTrue(sent.body.orEmpty(), sent.body.orEmpty().contains("\"client_id\":"))
        assertEquals("RET-2026-ABCDEFGH", after.receipt(LeadKind.Retainer))
    }

    @Test
    fun `a submission whose connection dropped is queued rather than lost`() = runBlocking {
        val repository =
            repository(
                transport = RecordingTransport { throw IOException("offline") },
                online = { true },
            )

        assertEquals(LeadSubmitOutcome.Queued, repository.submit(LeadKind.ProjectRequest, validProject()))
        assertEquals(1, repository.outboxStatus().pending)
    }

    @Test
    fun `a transient failure backs off and drains after its time`() = runBlocking {
        var online = false
        var millis = 0L
        var answer = 503
        val repository =
            repository(
                transport = RecordingTransport { HttpResponse(answer, "") },
                online = { online },
                nowMillis = { millis },
            )
        repository.submit(LeadKind.ProjectRequest, validProject())
        online = true

        val first = repository.drain()
        assertEquals(0, first.replayed)
        assertEquals(1, first.pending)

        val second = repository.drain()
        assertEquals("not due yet, so not attempted twice", 1, repository.outboxStatus().pending)
        assertEquals(0, second.replayed)

        millis = 60_000
        answer = 200
        assertEquals("past the backoff the lead is due again", 1, repository.drain().replayed)
    }

    @Test
    fun `a permanent refusal is kept, surfaced, and can be retried`() = runBlocking {
        var online = false
        var answer = 400
        val repository =
            repository(
                transport = RecordingTransport { HttpResponse(answer, """{"error":"not like this"}""") },
                online = { online },
            )
        repository.submit(LeadKind.Training, validTraining())
        online = true

        val refused = repository.drain()
        assertEquals(0, refused.replayed)
        assertEquals(1, refused.failed)
        assertEquals("the intent is kept, not dropped", 1, repository.outboxStatus().failed)

        answer = 200
        val retried = repository.retryFailed()

        assertEquals(1, retried.replayed)
        assertEquals(0, retried.failed)
        assertEquals(0, repository.outboxStatus().pending)
    }

    @Test
    fun `a refusal on the online path is reported, not queued`() = runBlocking {
        val repository =
            repository(
                transport = RecordingTransport {
                    HttpResponse(400, """{"error":"تحقق من الحقول المدخلة."}""")
                },
            )

        val outcome = repository.submit(LeadKind.Training, validTraining())

        assertEquals(LeadSubmitOutcome.Failed("تحقق من الحقول المدخلة."), outcome)
        assertEquals("a body the server refuses is not replayed forever", 0, repository.outboxStatus().pending)
    }

    private suspend fun repository(
        transport: RecordingTransport,
        signedIn: Boolean = false,
        online: () -> Boolean = { true },
        nowMillis: () -> Long = { 0L },
    ): LeadsRepository {
        val session =
            Session(
                MemoryTokenStore("refresh-1"),
                TokenRefresher { RefreshOutcome.Refused },
                MemoryIdentityStorage(Identity.Guest),
            )
        if (signedIn) session.signIn(TokenPair("access-1", "refresh-1", "user-1"))

        return LeadsRepository(
            stores = stores,
            client = ApiClient("https://app.test", session, transport),
            signedIn = { signedIn },
            online = online,
            clock = TestClock(),
            nowMillis = nowMillis,
            random = { 0.5 },
        )
    }

    private fun validTraining() =
        LeadDraft(
            fullName = "أحمد العلي",
            phone = "+963 999 123 456",
            cohortId = "11111111-1111-4111-8111-111111111111",
        )

    private fun validProject() =
        LeadDraft(
            fullName = "أحمد العلي",
            phone = "0999999999",
            projectType = "website",
            description = "مشروع تجريبي لاختبار الإرسال دون اتصال بالشبكة.",
        )

    private fun validRetainer() =
        LeadDraft(
            fullName = "محمد الحسن",
            phone = "0999999999",
            currentProjects = "متجر إلكتروني قائم على منصة سلة، وأحتاج إلى صيانته وتطويره.",
            needs = "صيانة دورية وإصلاح الأعطال وإضافة ميزات جديدة إلى المتجر الحالي.",
        )

    /** A clock the assertions can hold still: one id per call, one instant per call. */
    private class TestClock : WriteClock {
        private var counter = 0
        private var millis = 1_767_225_600_000L

        override fun uuid(): String {
            counter += 1
            return String.format(Locale.ROOT, "00000000-0000-7000-8000-%012d", counter)
        }

        override fun nowIso(): String {
            millis += 1_000
            return java.time.format.DateTimeFormatter.ofPattern(
                "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'",
                Locale.ROOT,
            )
                .withZone(java.time.ZoneOffset.UTC)
                .format(java.time.Instant.ofEpochMilli(millis))
        }

        override fun today(): String = "2026-01-01"
    }
}
