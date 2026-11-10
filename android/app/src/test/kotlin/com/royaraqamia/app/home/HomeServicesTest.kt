package com.royaraqamia.app.home

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.shell.ServicesSheetCopy
import com.royaraqamia.app.session.MemoryTokenStore
import com.royaraqamia.app.session.RefreshOutcome
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.TokenPair
import com.royaraqamia.app.session.TokenRefresher
import com.royaraqamia.app.store.MemoryIdentityStorage
import com.royaraqamia.app.support.RecordingTransport
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
 * The homepage's apps (#1194, ADR-0146): the device's list, the account's, and
 * the one merge a sign-in performs.
 *
 * These are JVM tests against real `SharedPreferences` (Robolectric) and the
 * app's own `ApiClient` over a recording transport, because the claims the
 * ticket makes are about a list that survives a restart and a request that
 * carries it — a fake store and a fake client would prove only that the fakes
 * agree with each other.
 *
 * The wire is counted, not assumed: a guest write must send nothing, and a merge
 * must send exactly the read and the one replace.
 */
@RunWith(RobolectricTestRunner::class)
class HomeServicesTest {
    private lateinit var context: Context
    private lateinit var store: PreferencesHomeServicesStore

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        context
            .getSharedPreferences(PreferencesHomeServicesStore.PREFERENCES_FILE, Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
        store = PreferencesHomeServicesStore(context)
    }

    @After
    fun tearDown() {
        context
            .getSharedPreferences(PreferencesHomeServicesStore.PREFERENCES_FILE, Context.MODE_PRIVATE)
            .edit()
            .clear()
            .commit()
    }

    @Test
    fun `a guest's list is written to the device and survives a restart`() = runBlocking {
        val transport = RecordingTransport { HttpResponse(500, "no answer") }
        val controller = controller(transport = transport, signedIn = false)

        controller.start()
        controller.toggle("/rates")
        controller.toggle("/quran")

        assertEquals(listOf("/rates", "/quran"), controller.order)
        assertEquals("a guest writes no request", 0, transport.hits)

        // A second store is what the next process opens: the list has to be on
        // disk, not in the controller that made it.
        val reopened = PreferencesHomeServicesStore(context)
        assertEquals(listOf("/rates", "/quran"), reopened.read())

        val restarted = controller(transport = transport, signedIn = false)
        restarted.start()
        assertEquals(listOf("/rates", "/quran"), restarted.order)
    }

    @Test
    fun `an unknown route is dropped and a duplicate keeps its first position`() {
        store.write(listOf("/rates", "/retired-app", "/rates", "/quran"))

        assertEquals(listOf("/rates", "/quran"), store.read().let(HomeServicesCatalog::sanitize))
    }

    @Test
    fun `a sign-in merges the device's list once and clears it`() = runBlocking {
        store.write(listOf("/rates"))
        val transport =
            RecordingTransport { request ->
                when (request.method) {
                    "GET" -> HttpResponse(200, """{"success":true,"data":["/quran"]}""")
                    else ->
                        HttpResponse(
                            200,
                            """{"success":true,"data":["/quran","/rates"]}""",
                        )
                }
            }
        val controller = controller(transport = transport, signedIn = true)

        controller.identityChanged()

        assertEquals(listOf("/quran", "/rates"), controller.order)
        assertEquals(2, transport.hits)
        val put = transport.requests.last()
        assertTrue("the whole set is written", put.body.orEmpty().contains("\"/quran\",\"/rates\""))
        assertEquals("the device's list is cleared after the account has it", emptyList<String>(), store.read())

        // The same identity does not merge twice: no second GET or PUT.
        controller.identityChanged()
        assertEquals(2, transport.hits)
    }

    @Test
    fun `a refused write moves the strip back and names the refusal`() = runBlocking {
        val transport =
            RecordingTransport { request ->
                when (request.method) {
                    "GET" -> HttpResponse(200, """{"success":true,"data":[]}""")
                    else -> HttpResponse(500, """{"success":false,"error":"nope"}""")
                }
            }
        val controller = controller(transport = transport, signedIn = true)
        controller.start()

        controller.toggle("/rates")

        assertEquals(emptyList<String>(), controller.order)
        assertEquals("the server's own sentence is what the sheet draws", "nope", controller.error)
        assertNull(controller.busy)
    }

    @Test
    fun `a refusal with no sentence draws the sheet's own words`() = runBlocking {
        val transport =
            RecordingTransport { request ->
                when (request.method) {
                    "GET" -> HttpResponse(200, """{"success":true,"data":[]}""")
                    else -> HttpResponse(502, "<html>bad gateway</html>")
                }
            }
        val controller = controller(transport = transport, signedIn = true)
        controller.start()

        controller.toggle("/rates")

        assertEquals(emptyList<String>(), controller.order)
        assertEquals(ServicesSheetCopy.FAILED, controller.error)
    }

    @Test
    fun `a failed read keeps the device's list and offers a retry`() = runBlocking {
        store.write(listOf("/rates"))
        val transport = RecordingTransport { HttpResponse(503, "down") }
        val controller = controller(transport = transport, signedIn = true)

        controller.start()

        assertEquals(listOf("/rates"), controller.order)
        assertEquals(HomeServicesStatus.Failed, controller.status)
    }

    private fun controller(
        transport: RecordingTransport,
        signedIn: Boolean,
    ): HomeServicesController {
        val session =
            Session(
                store = MemoryTokenStore(),
                refresher = TokenRefresher { RefreshOutcome.Refused },
                identities = MemoryIdentityStorage(),
            )
        if (signedIn) {
            runBlocking { session.signIn(TokenPair("access", "refresh", "user-1")) }
        }
        return HomeServicesController(
            repository = HomeServicesRepository(ApiClient("https://app.test", session, transport)),
            guest = store,
            signedIn = { session.signedIn },
            identityKey = { session.storeIdentity.key },
        )
    }
}
