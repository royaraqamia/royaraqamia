package com.royaraqamia.app.plans

import com.royaraqamia.app.contracts.ContractCodec
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The card's date, against the site's own output (ADR-0098).
 *
 * The sentence is generated from the copy source, but the date inside it is
 * formatted by each platform. `shared/fixtures/parity/hijri-dates.json` is what
 * `Intl.DateTimeFormat('ar-SA', { calendar: 'islamic-umalqura' })` produces, and
 * the web suite asserts the same file — so a month name, calendar variant or
 * numbering system that drifts on either side is a red test rather than a card
 * whose date is a day out.
 */
class HijriDateTest {
    private val cases: List<JsonObject> =
        ContractCodec.json
            .parseToJsonElement(File(fixturesDirectory(), "hijri-dates.json").readText())
            .jsonObject
            .getValue("cases")
            .jsonArray
            .map { it.jsonObject }

    @Test
    fun `the fixture set is not empty`() {
        assertTrue(cases.isNotEmpty())
    }

    @Test
    fun `every pinned instant reads the way the site reads it`() {
        for (case in cases) {
            val iso = case.getValue("iso").jsonPrimitive.content
            val label = case.getValue("label").jsonPrimitive.content
            assertEquals(iso, label, PlanDates.label(iso))
        }
    }

    @Test
    fun `a string that is not an instant is shown as it came`() {
        assertEquals("not-a-date", PlanDates.label("not-a-date"))
    }

    /** The fixture sits in the repository beside the contract, as the suite does. */
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
}
