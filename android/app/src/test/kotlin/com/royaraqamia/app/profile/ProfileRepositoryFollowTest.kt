package com.royaraqamia.app.profile

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.FollowToggleResponseState
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
 * The follow graph on a member's profile.
 *
 * The page renders the viewer's standing into its header, so the app reads the
 * route that answers it - one body for the read and both writes - instead of
 * making the public profile read identity-aware. A guest is answered `401`, and
 * that is the site's own gate rather than a failure the screen has to explain.
 */
class ProfileRepositoryFollowTest {
    private val standingBody =
        """
        {
          "success": true,
          "state": "following",
          "counts": { "followers": 4, "following": 7 }
        }
        """.trimIndent()

    private fun session(signedIn: Boolean): Session =
        runBlocking {
            Session(
                    MemoryTokenStore("refresh-1"),
                    TokenRefresher { RefreshOutcome.Refused },
                    MemoryIdentityStorage(),
                )
                .also { if (signedIn) it.signIn(TokenPair("access-1", "refresh-1", "user-1")) }
        }

    private fun repository(transport: RecordingTransport, signedIn: Boolean = true) =
        ProfileRepository(ApiClient("https://app.test", session(signedIn), transport))

    @Test
    fun `the standing is read on the follow route, with the viewer's bearer`() {
        val transport = RecordingTransport { HttpResponse(200, standingBody) }

        val result = runBlocking { repository(transport).standing("ahmad") }

        val body = (result as ApiResult.Success).value
        assertEquals(FollowToggleResponseState.FOLLOWING, body.state)
        assertEquals(4L, body.counts?.followers)
        assertEquals("GET", transport.requests.single().method)
        assertEquals("https://app.test/api/users/ahmad/follow", transport.requests.single().url)
        assertEquals("Bearer access-1", transport.requests.single().bearer)
    }

    @Test
    fun `follow and unfollow are the same route, one each way`() {
        val followTransport = RecordingTransport { HttpResponse(200, standingBody) }
        val unfollowTransport = RecordingTransport { HttpResponse(200, standingBody) }

        runBlocking {
            repository(followTransport).follow("ahmad")
            repository(unfollowTransport).unfollow("ahmad")
        }

        assertEquals("POST", followTransport.requests.single().method)
        assertEquals("DELETE", unfollowTransport.requests.single().method)
        assertEquals(
            "https://app.test/api/users/ahmad/follow",
            followTransport.requests.single().url,
        )
    }

    @Test
    fun `no session is a sign-in, and no request is sent`() {
        val transport = RecordingTransport { HttpResponse(200, standingBody) }

        val result = runBlocking { repository(transport, signedIn = false).standing("ahmad") }

        assertEquals(ApiResult.Failure(ApiError.NotSignedIn), result)
        assertTrue(transport.requests.isEmpty())
    }

    @Test
    fun `an unblock answers the account page's own blocks route`() {
        val transport = RecordingTransport { HttpResponse(200, """{"success":true}""") }

        val result = runBlocking { repository(transport).unblock("user-2") }

        assertTrue(result is ApiResult.Success)
        assertEquals("DELETE", transport.requests.single().method)
        assertEquals("https://app.test/api/chats/blocks/user-2", transport.requests.single().url)
    }
}
