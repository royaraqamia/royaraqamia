package com.royaraqamia.app.rates

import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.contracts.generated.RatesBoard
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The site's conversion arithmetic, against the site's own answers (#658).
 *
 * `shared/rates.ts` converts on the server-owned board, so the app does the same
 * arithmetic on the same rows — the one thing a contract cannot generate. The
 * shared fixture is what the vitest suite proves the site computes; this test
 * proves the Kotlin computes it too, case for case, so a doubled, inverted or
 * basis-ignoring rate is red here rather than a number a visitor has to notice.
 */
class RatesMathTest {
    private val fixture: JsonObject =
        ContractCodec.json
            .parseToJsonElement(File(fixturesDirectory(), "rates-board.json").readText())
            .jsonObject

    private val board: RatesBoard =
        ContractCodec.json.decodeFromJsonElement(fixture.getValue("board"))

    private fun text(entry: JsonObject, key: String): String? =
        entry[key]?.takeIf { it !is JsonNull }?.jsonPrimitive?.content

    private fun strings(entry: JsonObject, key: String): List<String> =
        entry.getValue(key).jsonArray.map { it.jsonPrimitive.content }

    @Test
    fun `the pinned board is readable by the generated contract`() {
        assertEquals("USD", board.base)
        assertEquals(listOf("XAU", "XAG"), board.metals.map { it.code })
        assertEquals(
            2,
            board.currencies.first { it.code == "YER" }.parallelMarkets?.size,
        )
    }

    @Test
    fun `every pinned conversion comes out the same`() {
        for (case in fixture.getValue("conversions").jsonArray.map { it.jsonObject }) {
            val name = text(case, "name").orEmpty()
            val lookup = RatesMath.buildLookup(board, text(case, "market"))
            val conversion =
                RatesMath.convertAmount(
                    lookup = lookup,
                    from = text(case, "from").orEmpty(),
                    to = text(case, "to").orEmpty(),
                    amount = case.getValue("amount").jsonPrimitive.content.toDouble(),
                    basis = RateBasis.of(text(case, "basis") ?: "official"),
                    karat = case["karat"]?.jsonPrimitive?.int,
                )

            val expected = case.getValue("expected")
            if (expected is JsonNull) {
                assertNull(name, conversion)
                continue
            }

            assertNotNull(name, conversion)
            val numbers = expected.jsonObject
            assertEquals(
                name,
                numbers.getValue("result").jsonPrimitive.content.toDouble(),
                conversion!!.result,
                TOLERANCE,
            )
            assertEquals(
                name,
                numbers.getValue("rate").jsonPrimitive.content.toDouble(),
                conversion.rate,
                TOLERANCE,
            )
        }
    }

    @Test
    fun `every pinned pair offers the same markets`() {
        for (case in fixture.getValue("markets").jsonArray.map { it.jsonObject }) {
            assertEquals(
                strings(case, "codes").joinToString("/"),
                strings(case, "expected"),
                RatesMath.marketOptions(board, strings(case, "codes")).map { it.key },
            )
        }
    }

    @Test
    fun `every pinned pair carries the same oldest market day`() {
        for (case in fixture.getValue("oldestParallelAsOf").jsonArray.map { it.jsonObject }) {
            assertEquals(
                strings(case, "codes").joinToString("/"),
                text(case, "expected"),
                RatesMath.oldestParallelAsOf(board, strings(case, "codes")),
            )
        }
    }

    @Test
    fun `every pinned visitor starts on the same pair`() {
        for (case in fixture.getValue("defaults").jsonArray.map { it.jsonObject }) {
            val detected = text(case, "detectedCurrency")
            val label = detected ?: "null"
            assertEquals(label, text(case, "to"), RatesMath.resolveDefaultTarget(board, detected))
            assertEquals(
                label,
                text(case, "from") to text(case, "to"),
                RatesMath.resolveDefaultPair(board, detected),
            )
        }
    }

    @Test
    fun `a market the board does not quote is ignored`() {
        val lookup = RatesMath.buildLookup(board, "nowhere")
        assertEquals(530.0, lookup.parallel.getValue("YER"), 0.0)
    }

    @Test
    fun `the fixture is not empty`() {
        assertTrue(fixture.getValue("conversions").jsonArray.isNotEmpty())
    }

    /** The fixture sits in the repository beside the contract, as the suites do. */
    private fun fixturesDirectory(): File {
        val start = File(System.getProperty("user.dir") ?: ".").absoluteFile
        var candidate: File? = start
        while (candidate != null) {
            val fixtures = File(candidate, "shared/fixtures/parity")
            if (fixtures.isDirectory) return fixtures
            candidate = candidate.parentFile
        }
        throw IllegalStateException("shared/fixtures/parity not found above $start")
    }

    private companion object {
        /** The fixture's own precision: values are pinned to six decimals. */
        const val TOLERANCE = 1e-6
    }
}
