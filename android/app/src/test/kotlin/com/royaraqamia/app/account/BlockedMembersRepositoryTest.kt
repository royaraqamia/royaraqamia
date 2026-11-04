package com.royaraqamia.app.account

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
 * The blocked-members read and unblock, against the site's two routes (#977).
 *
 * The repository reads the same body the page reads and asks the same two paths,
 * so the app cannot list a member the page would not, or lift a block the page
 * would keep — one route per surface (ADR-0098).
 */
class BlockedMembersRepositoryTest {
    private val listBody =
        """
        {
          "success": true,
          "blocked": [
            { "id": "user-2", "username": "sara", "name": "سارة", "avatarUrl": null, "verified": true },
            { "id": "user-3", "username": "omar", "name": null, "avatarUrl": "https://cdn.test/omar.png", "verified": false }
          ]
        }
        """.trimIndent()

    private fun repository(transport: RecordingTransport): BlockedMembersRepository {
        val session =
            runBlocking {
                Session(
                        MemoryTokenStore("refresh-1"),
                        TokenRefresher { RefreshOutcome.Refused },
                        MemoryIdentityStorage(),
                    )
                    .also { it.signIn(TokenPair("access-1", "refresh-1", "user-1")) }
            }
        return BlockedMembersRepository(ApiClient("https://app.test", session, transport))
    }

    @Test
    fun `the list maps every member the page would list`() {
        val transport = RecordingTransport { HttpResponse(200, listBody) }

        val result = runBlocking { repository(transport).list() }

        val members = (result as ApiResult.Success).value
        assertEquals(listOf("user-2", "user-3"), members.map { it.id })
        assertEquals("sara", members[0].username)
        assertEquals("سارة", members[0].name)
        assertEquals(null, members[1].name)
        assertEquals("https://cdn.test/omar.png", members[1].avatarUrl)
        assertEquals("GET", transport.requests.single().method)
        assertEquals("https://app.test/api/chats/blocks", transport.requests.single().url)
    }

    @Test
    fun `a refused body is a failure, not an empty list`() {
        val result =
            runBlocking {
                repository(
                        RecordingTransport { HttpResponse(200, """{"success":false,"error":"nope"}""") }
                    )
                    .list()
            }

        assertEquals(ApiResult.Failure(ApiError.Server(200, "nope")), result)
    }

    @Test
    fun `no session is a sign-in, not a failure`() {
        val repository =
            BlockedMembersRepository(
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
        assertEquals(BlockedMembersUiState.SignedOut, BlockedMembersUiState.from(result))
    }

    @Test
    fun `an unblock asks the member's own path and reports what the server said`() {
        val transport = RecordingTransport { HttpResponse(200, """{"success":true}""") }

        val result = runBlocking { repository(transport).unblock("user-2") }

        assertTrue(result is ApiResult.Success)
        assertEquals("DELETE", transport.requests.single().method)
        assertEquals("https://app.test/api/chats/blocks/user-2", transport.requests.single().url)
    }

    @Test
    fun `a refused unblock keeps the reason`() {
        val result =
            runBlocking {
                repository(
                        RecordingTransport { HttpResponse(200, """{"success":false,"error":"gone"}""") }
                    )
                    .unblock("user-2")
            }

        assertEquals(ApiResult.Failure(ApiError.Server(200, "gone")), result)
    }

    @Test
    fun `the screen's states come from the read`() {
        val members = listOf(BlockedMember("user-2", "sara", "سارة", null))

        assertEquals(
            BlockedMembersUiState.Ready(members),
            BlockedMembersUiState.from(ApiResult.Success(members)),
        )
        assertEquals(
            BlockedMembersUiState.Failed(null),
            BlockedMembersUiState.from(ApiResult.Failure(ApiError.Network("no radio"))),
        )
        assertEquals(
            BlockedMembersUiState.Failed("الخدمة غير متاحة"),
            BlockedMembersUiState.from(
                ApiResult.Failure(
                    ApiError.Server(500, """{"success":false,"error":"الخدمة غير متاحة"}""")
                )
            ),
        )
        assertTrue(BlockedMembersUiState.Ready(emptyList()).isEmpty)
    }
}
