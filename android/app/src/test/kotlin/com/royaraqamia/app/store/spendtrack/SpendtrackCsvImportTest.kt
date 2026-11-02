package com.royaraqamia.app.store.spendtrack

import androidx.test.core.app.ApplicationProvider
import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.net.HttpResponse
import com.royaraqamia.app.session.MemoryTokenStore
import com.royaraqamia.app.session.RefreshOutcome
import com.royaraqamia.app.session.Session
import com.royaraqamia.app.session.TokenPair
import com.royaraqamia.app.session.TokenRefresher
import com.royaraqamia.app.store.Identity
import com.royaraqamia.app.store.IdentityScopedStore
import com.royaraqamia.app.store.MemoryIdentityStorage
import com.royaraqamia.app.support.RecordingTransport
import kotlinx.coroutines.runBlocking
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner

/**
 * The CSV import (#653).
 *
 * The one action on the surface that is a request rather than a queued write, so
 * what is worth pinning is that it posts the file's text to the route the site
 * posts to and reads the answer the site's dialog reads.
 */
@RunWith(RobolectricTestRunner::class)
class SpendtrackCsvImportTest {
    private val alice = Identity.User("alice-id")
    private lateinit var databases: IdentityScopedStore<SpendtrackStores>

    @Before
    fun setUp() {
        databases =
            IdentityScopedStore {
                SpendtrackStores.open(ApplicationProvider.getApplicationContext(), it)
            }
    }

    @After
    fun tearDown() {
        databases.close()
        ApplicationProvider.getApplicationContext<android.content.Context>()
            .deleteDatabase(SpendtrackDatabase.fileName(alice))
    }

    @Test
    fun `an import posts the file's text to the route the site posts to`() = runBlocking {
        var body: String? = null
        val transport =
            RecordingTransport { request ->
                body = request.body
                HttpResponse(200, """{"imported":3,"skipped":1,"errors":[{"row":4,"message":"bad"}]}""")
            }
        val repository = repository(transport)

        val result = repository.importCsv("date,amount,category,description\n")

        assertTrue(result is ApiResult.Success)
        val value = (result as ApiResult.Success).value
        assertEquals(3, value.imported)
        assertEquals(1, value.skipped)
        assertEquals(4L, value.errors.single().row)

        val sent = transport.requests.single()
        assertEquals("POST", sent.method)
        assertTrue(sent.url, sent.url.endsWith("/spendtrack/api/import"))
        assertTrue(body.orEmpty(), body.orEmpty().contains("date,amount,category,description"))
    }

    @Test
    fun `a refused import is a failure the dialog can name`() = runBlocking {
        val repository = repository(RecordingTransport { HttpResponse(400, """{"error":"no"}""") })

        assertTrue(repository.importCsv("nope") is ApiResult.Failure)
    }

    private suspend fun repository(transport: RecordingTransport): SpendtrackRepository {
        val session =
            Session(
                MemoryTokenStore("refresh-1"),
                TokenRefresher { RefreshOutcome.Refused },
                MemoryIdentityStorage(alice),
            )
        session.signIn(TokenPair("access-1", "refresh-1", "alice-id"))

        return SpendtrackRepository(
            databases = databases,
            identity = { alice },
            client = ApiClient("https://app.test", session, transport),
        )
    }
}
