package com.royaraqamia.app.assistant

import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.contracts.generated.ScreenContextSnapshot
import com.royaraqamia.app.shell.ResolvedScreen
import com.royaraqamia.app.shell.Screens
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The screen snapshot and the route table, from the app side (#1422).
 *
 * The site computes the same fixture (`shared/fixtures/__tests__/screen-snapshot.test.ts`),
 * and the two halves answer two different questions. The snapshot half proves the
 * generated type decodes the body the server's schema describes *and* writes it
 * back with the same field names - `screenId` where the site wrote `screenId`,
 * `focus` and `tab` present even when they are null. The resolver half proves the
 * generated table places a path where the site places it, so the id in a turn's
 * snapshot names the screen the same turn on the site would have named (ADR-0098,
 * ADR-0181).
 */
class ScreenSnapshotFixtureTest {
    private val fixture: JsonObject =
        ContractCodec.json
            .parseToJsonElement(File(fixturesDirectory(), "screen-snapshot.json").readText())
            .jsonObject

    private val snapshot: JsonObject = fixture.getValue("snapshot").jsonObject

    private fun decoded(): ScreenContextSnapshot =
        when (val result = ContractCodec.decode<ScreenContextSnapshot>(snapshot.toString())) {
            is ApiResult.Success -> result.value
            is ApiResult.Failure -> throw AssertionError("the fixture did not decode: $result")
        }

    @Test
    fun `names the schema both clients read`() {
        assertEquals(
            "ScreenContextSnapshotSchema",
            fixture.getValue("contract").jsonPrimitive.content,
        )
    }

    @Test
    fun `decodes the body the site publishes`() {
        assertEquals(snapshot.getValue("screenId").jsonPrimitive.content, decoded().screenId)
    }

    @Test
    fun `writes the body back with the schema's own field names`() {
        val written = ScreenContextInput.Shown(decoded()).toJsonObject()

        assertEquals(snapshot.keys.sorted(), written.keys.sorted())
        // A nullable field is present, not dropped: the schema requires `tab`, so
        // a body that omitted it would be refused rather than read as shorter.
        assertTrue("tab must be written even when null", written.containsKey("tab"))
        assertEquals(snapshot.getValue("screenId"), written.getValue("screenId"))
    }

    @Test
    fun `the blind arm is the site's second shape`() {
        val written = ScreenContextInput.Blind.toJsonObject()
        assertEquals(setOf("blind"), written.keys)
        assertEquals("true", written.getValue("blind").toString())
    }

    @Test
    fun `places every route where the site places it`() {
        val cases = fixture.getValue("resolver").jsonArray.map { it.jsonObject }
        assertTrue("the fixture set is empty", cases.isNotEmpty())

        for (case in cases) {
            val route = case.getValue("route").jsonPrimitive.content
            val tab = case.getValue("tab").stringOrNull()
            val screenId = case.getValue("screenId").jsonPrimitive.content

            val expected =
                if (screenId.isEmpty()) {
                    null
                } else {
                    ResolvedScreen(
                        screenId = screenId,
                        product = case.getValue("product").jsonPrimitive.content,
                        tab = tab,
                    )
                }

            assertEquals(
                "${case.getValue("name").jsonPrimitive.content}: $route",
                expected,
                Screens.resolve(route, tab),
            )
        }
    }

    companion object {
        /** The fixtures live in the repository, not in the app module: one file, both suites. */
        fun fixturesDirectory(): File {
            val start = File(System.getProperty("user.dir") ?: ".").absoluteFile
            var candidate: File? = start
            while (candidate != null) {
                val fixtures = File(candidate, "shared/fixtures/parity")
                if (fixtures.isDirectory) return fixtures
                candidate = candidate.parentFile
            }
            throw IllegalStateException("shared/fixtures/parity not found above $start")
        }
    }
}

/** The string a JSON value names, or `null` for the JSON null a nullable field holds. */
private fun JsonElement.stringOrNull(): String? =
    (this as? JsonPrimitive)?.takeIf { it.isString }?.content
