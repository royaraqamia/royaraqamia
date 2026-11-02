package com.royaraqamia.app.community

import com.royaraqamia.app.contracts.ContractCodec
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The card's text, against the site's own output (#658).
 *
 * The label a card shows and the body it clamps are derived from markdown by
 * `shared/reading-time.ts`, and the app applies the same rules in [PostText]. A
 * pipeline of replacements is exactly the kind of thing two clients implement
 * slightly differently, so `shared/fixtures/parity/post-text.json` is what the
 * TypeScript computes — the web suite asserts the same file — and this test is
 * what makes the Kotlin answer the same, case for case (ADR-0098).
 */
class PostTextFixtureTest {
    private val cases: List<JsonObject> =
        ContractCodec.json
            .parseToJsonElement(File(fixturesDirectory(), "post-text.json").readText())
            .jsonObject
            .getValue("cases")
            .jsonArray
            .map { it.jsonObject }

    private fun text(entry: JsonObject, key: String): String =
        entry[key]?.takeIf { it !is JsonNull }?.jsonPrimitive?.content.orEmpty()

    @Test
    fun `the fixture set is not empty`() {
        assertTrue(cases.isNotEmpty())
    }

    @Test
    fun `every pinned body strips to the same plain text`() {
        for (case in cases) {
            val name = text(case, "name")
            assertEquals(name, text(case, "stripped"), PostText.stripMarkdown(text(case, "markdown")))
        }
    }

    @Test
    fun `every pinned body is excerpted the same way`() {
        for (case in cases) {
            val name = text(case, "name")
            assertEquals(
                name,
                text(case, "excerpt"),
                PostText.excerpt(text(case, "markdown"), text(case, "fallback")),
            )
        }
    }

    @Test
    fun `a body past the label length ends in the site's ellipsis`() {
        val long = cases.firstOrNull { text(it, "stripped").length > 160 }
        assertTrue("the fixture set needs a body past 160 characters", long != null)
        assertTrue(text(long!!, "excerpt").endsWith("…"))
    }

    @Test
    fun `the no-break space the site collapses is collapsed here too`() {
        assertEquals("كلمة أخرى", PostText.stripMarkdown("كلمة\u00A0أخرى"))
    }

    companion object {
        /**
         * The fixtures live in the repository, not in the app module: the same
         * file is what the web suite reads. Walking up finds the checkout root
         * from wherever Gradle ran the test.
         */
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
