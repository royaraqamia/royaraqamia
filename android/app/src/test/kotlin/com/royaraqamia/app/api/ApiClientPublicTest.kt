package com.royaraqamia.app.api

import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.contracts.generated.VerifyRequest
import com.royaraqamia.app.contracts.generated.VerifyResult
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
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.IOException

/**
 * The public half of the client (#658): the routes the site serves to a visitor.
 *
 * The difference from the bearer path is the contract, not the caller's luck, so
 * the tests that matter are the two that would be wrong if this were "send the
 * token if there is one": no `Authorization` header on the wire, and an answer
 * that arrives whether or not a session exists.
 */
class ApiClientPublicTest {
    private val baseUrl = "https://app.test"
    private val verifyUrl = "$baseUrl/api/certificates/verify"

    private val foundBody =
        """
        {
          "success": true,
          "certificate": {
            "id": "c-1",
            "certificate_code": "COMP-2026-UHVW9SG5",
            "student_name": "طالب",
            "course_name": "دورة",
            "issue_date": "2026-01-01",
            "expiration_date": null,
            "grade_or_status": null,
            "created_at": "2026-01-01T00:00:00.000Z"
          }
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

    private fun signedIn(): Session =
        runBlocking {
            Session(
                    MemoryTokenStore("refresh-1"),
                    object : TokenRefresher {
                        override suspend fun refresh(refreshToken: String) = RefreshOutcome.Refused
                    },
                    MemoryIdentityStorage(),
                )
                .also { it.signIn(TokenPair("access-1", "refresh-1", "user-1")) }
        }

    @Test
    fun `a public post is sent with no bearer, even for a signed-in member`() {
        val transport = RecordingTransport { HttpResponse(200, foundBody) }
        val client = ApiClient(baseUrl, signedIn(), transport)

        val result =
            runBlocking {
                client.postPublic<VerifyResult>(
                    "/api/certificates/verify",
                    ContractCodec.encode(VerifyRequest("COMP-2026-UHVW9SG5")),
                )
            }

        assertTrue(result is ApiResult.Success)
        assertEquals(
            "COMP-2026-UHVW9SG5",
            (result as ApiResult.Success).value.certificate?.certificate_code,
        )

        val request = transport.requests.single()
        assertEquals("POST", request.method)
        assertEquals(verifyUrl, request.url)
        assertNull("a public route carries no token", request.bearer)
        assertEquals("""{"code":"COMP-2026-UHVW9SG5"}""", request.body)
    }

    @Test
    fun `a guest's public post is sent rather than answered NotSignedIn`() {
        val transport = RecordingTransport { HttpResponse(200, """{"success":false}""") }
        val client = ApiClient(baseUrl, guest(), transport)

        val result =
            runBlocking { client.postPublic<VerifyResult>(VERIFY_PATH, """{"code":"X"}""") }

        assertTrue(result is ApiResult.Success)
        assertEquals(1, transport.hits)
    }

    @Test
    fun `a public post that never reached the server is a network failure`() {
        val client =
            ApiClient(
                baseUrl,
                guest(),
                RecordingTransport { throw IOException("offline") },
            )

        val result =
            runBlocking { client.postPublic<VerifyResult>(VERIFY_PATH, """{"code":"X"}""") }

        assertEquals(ApiResult.Failure(ApiError.Network("offline")), result)
    }

    @Test
    fun `a refused public post keeps the status and the body`() {
        val client =
            ApiClient(
                baseUrl,
                guest(),
                RecordingTransport { HttpResponse(429, "slow down") },
            )

        val result =
            runBlocking { client.postPublic<VerifyResult>(VERIFY_PATH, """{"code":"X"}""") }

        assertEquals(ApiResult.Failure(ApiError.Server(429, "slow down")), result)
    }

    private companion object {
        const val VERIFY_PATH = "/api/certificates/verify"
    }
}
