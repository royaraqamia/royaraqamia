package com.royaraqamia.app.session

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The session cookie, from the package that owns it (#1194).
 *
 * `shared/fixtures/session-cookie/manifest.json` is written by `@supabase/ssr`
 * itself, and the web suite re-derives every case through the same package
 * (`shared/fixtures/__tests__/session-cookie.test.ts`). This suite is the other
 * half: the app reads the package's cookie and writes back the very bytes the
 * package wrote, so a format change is red on both clients rather than a member
 * silently signed out on one.
 */
class DocumentSessionFixtureTest {
    private val directory = fixturesDirectory()
    private val manifest: JsonObject =
        Json.parseToJsonElement(File(directory, "manifest.json").readText()).jsonObject
    private val storageKey = manifest.getValue("storageKey").jsonPrimitive.content
    private val authUrl = manifest.getValue("authUrl").jsonPrimitive.content
    private val cases = manifest.getValue("cases").jsonArray.map { it.jsonObject }

    @Test
    fun `the storage key is derived from the auth base the app already has`() {
        assertEquals(storageKey, DocumentSessionCookie.storageKey(authUrl))
    }

    @Test
    fun `every case reads as the session the package stored`() {
        assertTrue(cases.isNotEmpty())
        for (case in cases) {
            val name = case.getValue("name").jsonPrimitive.content
            val read = DocumentSessionCookie.read(headerOf(case), storageKey)
            val expected = case.getValue("expected").jsonObject

            assertEquals("$name: access token", expected.string("accessToken"), read?.accessToken)
            assertEquals("$name: refresh token", expected.string("refreshToken"), read?.refreshToken)
            assertEquals("$name: user", expected.string("userId"), read?.userId)
            assertEquals(
                "$name: expiry",
                expected.getValue("expiresAt").jsonPrimitive.content.toLong(),
                read?.expiresAt,
            )
        }
    }

    @Test
    fun `every case writes back the bytes the package wrote`() {
        for (case in cases) {
            val name = case.getValue("name").jsonPrimitive.content
            val read = checkNotNull(DocumentSessionCookie.read(headerOf(case), storageKey)) { "$name: unreadable" }

            val written =
                DocumentSessionCookie.changes(read, storageKey, emptySet())
                    .filterIsInstance<CookieChange.Set>()
                    .associate { it.name to it.value }
            val stored =
                case.getValue("cookies").jsonArray
                    .map { it.jsonObject }
                    .associate { it.string("name") to it.string("value") }

            assertEquals("$name: the jar the package wrote", stored, written)
        }
    }

    private fun headerOf(case: JsonObject): String =
        case.getValue("cookies").jsonArray
            .joinToString("; ") {
                val cookie = it.jsonObject
                "${cookie.string("name")}=${cookie.string("value")}"
            }

    private fun JsonObject.string(key: String): String =
        getValue(key).jsonPrimitive.content

    private fun fixturesDirectory(): File {
        val start = File(System.getProperty("user.dir") ?: ".").absoluteFile
        var candidate: File? = start
        while (candidate != null) {
            val fixtures = File(candidate, "shared/fixtures/session-cookie")
            if (fixtures.isDirectory) return fixtures
            candidate = candidate.parentFile
        }
        throw IllegalStateException("shared/fixtures/session-cookie not found above $start")
    }
}
