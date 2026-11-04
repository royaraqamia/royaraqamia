package com.royaraqamia.app.preferences

import com.royaraqamia.app.account.AccountServicesUiState
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
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The hidden-services read and write, against the site's one route (#978).
 *
 * The page and the app share `/api/me/hidden-services`, so a restore in the app
 * has to be the same replacement the page makes. The paths, the verb and the body
 * are asserted rather than assumed: a rename on the site is the failure this test
 * exists to catch (ADR-0098).
 */
class HiddenServicesRepositoryTest {
    private fun repository(transport: RecordingTransport): HiddenServicesRepository {
        val session =
            runBlocking {
                Session(
                        MemoryTokenStore("refresh-1"),
                        TokenRefresher { RefreshOutcome.Refused },
                        MemoryIdentityStorage(),
                    )
                    .also { it.signIn(TokenPair("access-1", "refresh-1", "user-1")) }
            }
        return HiddenServicesRepository(ApiClient("https://app.test", session, transport))
    }

    @Test
    fun `the read is the page's route and answers the hidden set`() {
        val transport =
            RecordingTransport {
                HttpResponse(200, """{"success":true,"data":["/quran","/news"]}""")
            }

        val result = runBlocking { repository(transport).list() }

        assertEquals(ApiResult.Success(setOf("/quran", "/news")), result)
        assertEquals("GET", transport.requests.single().method)
        assertEquals("https://app.test/api/me/hidden-services", transport.requests.single().url)
    }

    @Test
    fun `a refused read is a failure, not an empty set`() {
        val result =
            runBlocking {
                repository(
                        RecordingTransport {
                            HttpResponse(200, """{"success":false,"error":"nope"}""")
                        }
                    )
                    .list()
            }

        assertEquals(ApiResult.Failure(ApiError.Server(200, "nope")), result)
    }

    @Test
    fun `no session is a sign-in, not a failure`() {
        val repository =
            HiddenServicesRepository(
                ApiClient(
                    "https://app.test",
                    runBlocking {
                        Session(
                            MemoryTokenStore("r"),
                            TokenRefresher { RefreshOutcome.Refused },
                            MemoryIdentityStorage(),
                        )
                    },
                )
            )

        val result = runBlocking { repository.list() }

        assertEquals(ApiResult.Failure(ApiError.NotSignedIn), result)
        assertEquals(AccountServicesUiState.SignedOut, AccountServicesUiState.from(result))
    }

    @Test
    fun `replacing the set is the page's PUT with the hidden routes`() {
        val transport =
            RecordingTransport {
                HttpResponse(200, """{"success":true,"data":["/quran","/athkar"]}""")
            }

        val result = runBlocking { repository(transport).replace(setOf("/quran", "/athkar")) }

        assertEquals(ApiResult.Success(setOf("/quran", "/athkar")), result)
        val request = transport.requests.single()
        assertEquals("PUT", request.method)
        assertEquals("https://app.test/api/me/hidden-services", request.url)
        assertTrue(request.body.orEmpty().contains("\"hidden\""))
        assertTrue(request.body.orEmpty().contains("\"/quran\""))
        assertTrue(request.body.orEmpty().contains("\"/athkar\""))
    }

    @Test
    fun `a refused write keeps the reason`() {
        val result =
            runBlocking {
                repository(
                        RecordingTransport {
                            HttpResponse(200, """{"success":false,"error":"gone"}""")
                        }
                    )
                    .replace(emptySet())
            }

        assertEquals(ApiResult.Failure(ApiError.Server(200, "gone")), result)
    }

    @Test
    fun `the screen's states come from the read`() {
        assertEquals(
            AccountServicesUiState.Ready(setOf("/quran")),
            AccountServicesUiState.from(ApiResult.Success(setOf("/quran"))),
        )
        assertEquals(
            AccountServicesUiState.Failed(null),
            AccountServicesUiState.from(ApiResult.Failure(ApiError.Network("no radio"))),
        )
        assertEquals(
            AccountServicesUiState.Failed("الخدمة غير متاحة"),
            AccountServicesUiState.from(
                ApiResult.Failure(
                    ApiError.Server(500, """{"success":false,"error":"الخدمة غير متاحة"}""")
                )
            ),
        )
    }
}
