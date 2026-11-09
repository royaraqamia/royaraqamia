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
 * The account profile's two writes (#945), on the routes the page posts to.
 *
 * The name is a `PATCH` with a generated body and the avatar is a
 * `POST` with the one `file` part `req.formData().get('file')` reads. Both carry
 * the same origin signal the page's browser does, because the routes refuse a
 * request that does not name it — the app is not a browser, but it is the same
 * origin's client.
 */
class AccountProfileRepositoryTest {
    private fun repository(transport: RecordingTransport): AccountProfileRepository {
        val session =
            runBlocking {
                Session(
                        MemoryTokenStore("refresh-1"),
                        TokenRefresher { RefreshOutcome.Refused },
                        MemoryIdentityStorage(),
                    )
                    .also { it.signIn(TokenPair("access-1", "refresh-1", "user-1")) }
            }
        return AccountProfileRepository(
            client = ApiClient("https://app.test", session, transport),
            avatars = AvatarLoader { null },
        )
    }

    @Test
    fun `the name is the page's PATCH with its generated body`() {
        val transport = RecordingTransport { HttpResponse(200, """{"success":true,"name":"أحمد"}""") }

        val result = runBlocking { repository(transport).updateName("أحمد") }

        assertTrue(result is ApiResult.Success)
        assertEquals("أحمد", (result as ApiResult.Success).value.name)

        val request = transport.requests.single()
        assertEquals("PATCH", request.method)
        assertEquals("https://app.test/api/me/name", request.url)
        assertEquals("Bearer access-1", request.bearer)
        assertEquals("application/json", request.headers["Content-Type"])
        assertEquals("""{"name":"أحمد"}""", request.body)
    }

    @Test
    fun `the write names the origin the route's guard asks for`() {
        val transport = RecordingTransport { HttpResponse(200, """{"success":true}""") }

        runBlocking { repository(transport).updateName("أحمد") }

        val request = transport.requests.single()
        assertEquals("https://app.test", request.headers["Origin"])
        assertEquals("same-origin", request.headers["Sec-Fetch-Site"])
    }

    @Test
    fun `the avatar is a multipart POST with the route's own file field`() {
        val transport =
            RecordingTransport {
                HttpResponse(200, """{"success":true,"avatarUrl":"https://cdn.test/a.png"}""")
            }
        val file =
            AvatarUpload(
                fileName = "avatar.png",
                mimeType = "image/png",
                bytes = "PNGDATA".toByteArray(Charsets.UTF_8),
            )

        val result = runBlocking { repository(transport).uploadAvatar(file) }

        assertTrue(result is ApiResult.Success)
        assertEquals(
            "https://cdn.test/a.png",
            (result as ApiResult.Success).value.avatarUrl,
        )

        val request = transport.requests.single()
        assertEquals("POST", request.method)
        assertEquals("https://app.test/api/me/avatar", request.url)
        assertEquals("Bearer access-1", request.bearer)
        assertTrue(
            request.headers.getValue("Content-Type").startsWith("multipart/form-data; boundary=")
        )

        val body = String(request.bodyBytes ?: ByteArray(0), Charsets.ISO_8859_1)
        assertTrue(body, body.contains("name=\"file\"; filename=\"avatar.png\""))
        assertTrue(body, body.contains("Content-Type: image/png"))
        assertTrue(body, body.contains("PNGDATA"))
    }

    @Test
    fun `a refused avatar is a failure carrying the server's status`() {
        val transport = RecordingTransport { HttpResponse(400, """{"success":false,"error":"صورة كبيرة"}""") }

        val result =
            runBlocking {
                repository(transport)
                    .uploadAvatar(AvatarUpload("a.png", "image/png", byteArrayOf(1)))
            }

        assertTrue(result is ApiResult.Failure)
        assertEquals(
            ApiError.Server(400, """{"success":false,"error":"صورة كبيرة"}"""),
            (result as ApiResult.Failure).error,
        )
    }
}
