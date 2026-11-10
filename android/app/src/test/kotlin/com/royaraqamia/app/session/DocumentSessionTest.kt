package com.royaraqamia.app.session

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The `@supabase/ssr` cookie, as this client reads and writes it (#1194).
 *
 * The format is a dependency's, so the cases are the ones a package upgrade or a
 * long session would produce: the plain value, the chunked one, a cookie this
 * build cannot read, and the stale chunks a shorter session leaves behind.
 */
class DocumentSessionTest {
    private val key = "sb-testref-auth-token"

    private fun session(
        access: String = "access-1",
        refresh: String = "refresh-1",
        user: String = "user-1",
        expiresAt: Long = 1_700_000_000,
        extra: String = "",
    ): String =
        """{"access_token":"$access","token_type":"bearer","expires_in":3600,""" +
            """"expires_at":$expiresAt,"refresh_token":"$refresh",""" +
            """"user":{"id":"$user","email":"a@example.com"}$extra}"""

    @Test
    fun `a plain cookie is the session`() {
        val raw = session()
        val header = "$key=base64-${DocumentSessionCookie.base64UrlEncode(raw)}; other=1"

        val read = DocumentSessionCookie.read(header, key)

        assertEquals(raw, read?.raw)
        assertEquals("access-1", read?.accessToken)
        assertEquals("refresh-1", read?.refreshToken)
        assertEquals("user-1", read?.userId)
        assertEquals(1_700_000_000L, read?.expiresAt)
    }

    @Test
    fun `a chunked cookie is joined before it is decoded`() {
        val raw = session(extra = ""","name":"${"\u0637".repeat(1500)}"""")
        val value = DocumentSessionCookie.BASE64_PREFIX + DocumentSessionCookie.base64UrlEncode(raw)
        assertTrue("the fixture has to be long enough to chunk", value.length > DocumentSessionCookie.MAX_CHUNK)
        val chunks = value.chunked(DocumentSessionCookie.MAX_CHUNK)
        val header = chunks.mapIndexed { index, chunk -> "$key.$index=$chunk" }.joinToString("; ")

        val read = DocumentSessionCookie.read(header, key)

        assertEquals(raw, read?.raw)
        assertEquals("user-1", read?.userId)
    }

    @Test
    fun `a cookie this build cannot read is no session, not a crash`() {
        assertNull(DocumentSessionCookie.read(null, key))
        assertNull(DocumentSessionCookie.read("$key=base64-not*base64url", key))
        assertNull(
            DocumentSessionCookie.read(
                "$key=base64-${DocumentSessionCookie.base64UrlEncode("not json")}",
                key,
            )
        )
        assertNull(
            DocumentSessionCookie.read(
                "$key=base64-${DocumentSessionCookie.base64UrlEncode("""{"access_token":"a"}""")}",
                key,
            )
        )
        assertNull(DocumentSessionCookie.read("other=1", key))
        assertNull(
            DocumentSessionCookie.read(
                "$key=base64-${
                    DocumentSessionCookie.base64UrlEncode(
                        """{"access_token":{},"refresh_token":"r","user":{"id":"u"}}"""
                    )
                }",
                key,
            )
        )
    }

    @Test
    fun `a short session writes one cookie and removes the chunks it no longer needs`() {
        val raw = session()
        val read =
            checkNotNull(
                DocumentSessionCookie.read("$key=base64-${DocumentSessionCookie.base64UrlEncode(raw)}", key)
            )

        val changes = DocumentSessionCookie.changes(read, key, setOf(key, "$key.1", "$key.2", "other"))

        assertEquals(
            listOf(
                CookieChange.Set(key, DocumentSessionCookie.BASE64_PREFIX + DocumentSessionCookie.base64UrlEncode(raw)),
                CookieChange.Remove("$key.1"),
                CookieChange.Remove("$key.2"),
            ),
            changes,
        )
    }

    @Test
    fun `a long session writes numbered chunks`() {
        val raw = session(extra = ""","name":"${"\u0637".repeat(1500)}"""")
        val read =
            checkNotNull(
                DocumentSessionCookie.read("$key=base64-${DocumentSessionCookie.base64UrlEncode(raw)}", key)
            )

        val changes = DocumentSessionCookie.changes(read, key, emptySet())
        val writes = changes.filterIsInstance<CookieChange.Set>()

        assertEquals(listOf("$key.0", "$key.1"), writes.map { it.name })
        assertEquals(
            "every chunk carries a fragment of one value",
            DocumentSessionCookie.BASE64_PREFIX + DocumentSessionCookie.base64UrlEncode(raw),
            writes.joinToString("") { it.value },
        )
    }

    @Test
    fun `a sign-out removes every chunk and nothing else`() {
        val removals = DocumentSessionCookie.removals(key, setOf(key, "$key.0", "$key.1", "sb-other", "other"))

        assertEquals(
            listOf(CookieChange.Remove(key), CookieChange.Remove("$key.0"), CookieChange.Remove("$key.1")),
            removals,
        )
    }

    @Test
    fun `the storage key is the package's, from the auth base`() {
        assertEquals(
            "sb-abcdefghijklmnop-auth-token",
            DocumentSessionCookie.storageKey("https://abcdefghijklmnop.supabase.co/auth/v1"),
        )
    }

    @Test
    fun `the codec is base64url without padding, and round-trips Arabic`() {
        assertEquals("aGVsbG8", DocumentSessionCookie.base64UrlEncode("hello"))
        assertEquals("hello", DocumentSessionCookie.base64UrlDecode("aGVsbG8"))
        val arabic =
            "{\"name\":\"\u0631\u0624\u064a\u0629 \u0631\u0642\u0645\u064a\u0629 123\"}"
        assertEquals(arabic, DocumentSessionCookie.base64UrlDecode(DocumentSessionCookie.base64UrlEncode(arabic)))
    }
}
