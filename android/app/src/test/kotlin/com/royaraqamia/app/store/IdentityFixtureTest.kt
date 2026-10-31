package com.royaraqamia.app.store

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import java.io.File

/**
 * The Local Store's partition, from the app side (#768).
 *
 * The cases are `shared/fixtures/local-store/identity.json`, the same file the
 * web's suite reads (`shared/fixtures/__tests__/local-store-identity.test.ts`),
 * so the two clients cannot name a device's rows differently: the web's
 * `localStoreName` and this package's `localStoreName` are one decision written
 * twice, held together by one file.
 */
class IdentityFixtureTest {
    private val fixture: JsonObject = parse(File(directory(), "identity.json").readText())

    @Test
    fun `names the partition the web names`() {
        val product = fixture.getValue("product").jsonPrimitive.content

        for (case in cases()) {
            val userId = case["userId"]?.takeIf { it !is kotlinx.serialization.json.JsonNull }
                ?.jsonPrimitive?.content
            val identity = Identity.of(userId)
            assertEquals(case.name(), case.getValue("identity").jsonPrimitive.content, identity.key)
            assertEquals(
                case.name(),
                case.getValue("store").jsonPrimitive.content,
                localStoreName(product, identity),
            )
        }
    }

    @Test
    fun `parses back the name it wrote`() {
        for (case in cases()) {
            val identity = Identity.parse(case.getValue("identity").jsonPrimitive.content)
            assertEquals(case.name(), case.getValue("identity").jsonPrimitive.content, identity?.key)
        }
    }

    @Test
    fun `an unnamed partition is nothing remembered, not a guest`() {
        // "Nothing remembered" (null) and "remembered as guest" (Guest) are
        // different answers: the first is a first launch, the second is a
        // session that resolved to nobody. Collapsing them would make a
        // sign-out indistinguishable from an upgrade.
        assertNull(Identity.parse(null))
        assertNull(Identity.parse(""))
        assertNull(Identity.parse("usuario:1"))
        assertNull(Identity.parse("user:"))
        assertEquals(Identity.Guest, Identity.parse("guest"))
    }

    private fun cases(): List<JsonObject> =
        fixture.getValue("cases").jsonArray.map { it.jsonObject }

    private fun JsonObject.name(): String = getValue("name").jsonPrimitive.content

    private fun parse(text: String): JsonObject =
        kotlinx.serialization.json.Json.parseToJsonElement(text).jsonObject

    /**
     * The fixtures live in the repository beside the spec they describe rather
     * than in the app's resources: one file both clients read is the point, so
     * the suite walks up from whatever directory Gradle runs it in.
     */
    private fun directory(): File {
        val start = File(System.getProperty("user.dir") ?: ".").absoluteFile
        var candidate: File? = start
        while (candidate != null) {
            val fixtures = File(candidate, "shared/fixtures/local-store")
            if (fixtures.isDirectory) return fixtures
            candidate = candidate.parentFile
        }
        throw IllegalStateException("shared/fixtures/local-store not found above $start")
    }
}
