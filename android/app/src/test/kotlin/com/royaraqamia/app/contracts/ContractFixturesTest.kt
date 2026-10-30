package com.royaraqamia.app.contracts

import com.royaraqamia.app.contracts.generated.MyUsageResponse
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

/**
 * The contract's fixture set, from the app side (#665).
 *
 * The same five bodies the web suite parses with the Zod schema
 * (`shared/fixtures/__tests__/contract-fixtures.test.ts`) are decoded here with
 * the generated Kotlin type, so a payload the site accepts and the app cannot is
 * a red test on both sides rather than a blank screen on a device. Expectation is
 * part of the fixture because the clients must also agree on which bodies are
 * unreadable.
 *
 * Both suites read `manifest.json` rather than the directory, so a case file
 * deleted without its line fails both, and both refuse a payload the manifest
 * does not list. The rules and the rest of the pair are on
 * `docs/mobile/two-clients.md`.
 */
class ContractFixturesTest {
    private val directory = fixturesDirectory()
    private val manifest: JsonObject =
        ContractCodec.json.parseToJsonElement(File(directory, "manifest.json").readText()).jsonObject
    private val cases = manifest.getValue("cases").jsonArray.map { it.jsonObject }

    @Test
    fun `lists exactly the payloads that sit beside it`() {
        val listed = cases.map { "${it.name()}.json" }.sorted()
        val present =
            (directory.listFiles() ?: emptyArray())
                .filter { it.extension == "json" && it.name != "manifest.json" }
                .map { it.name }
                .sorted()

        // A case file without a line is a body only this suite would run; a line
        // without a file is a body neither client would notice was gone.
        assertEquals("the manifest and the directory disagree", listed, present)
    }

    @Test
    fun `reads the contract the web suite reads`() {
        assertEquals("MyUsageResponseSchema", manifest.getValue("contract").jsonPrimitive.content)
        assertTrue("the fixture set is empty", cases.isNotEmpty())
    }

    @Test
    fun `gives every payload the name of its case`() {
        for (case in cases) {
            assertEquals(case.name(), payload(case).getValue("name").jsonPrimitive.content)
        }
    }

    @Test
    fun `decodes a body the contract allows`() {
        for (case in cases.filter { it.expectation() == "valid" }) {
            val result = ContractCodec.decode<MyUsageResponse>(body(case))
            assertTrue("${case.name()}: $result", result is ApiResult.Success)
        }
    }

    @Test
    fun `refuses a body the contract does not, naming the field`() {
        val refused = cases.filter { it.expectation() == "invalid" }
        assertTrue("the fixture set needs a refused body", refused.isNotEmpty())

        for (case in refused) {
            val result = ContractCodec.decode<MyUsageResponse>(body(case))
            assertTrue("${case.name()}: decoded", result is ApiResult.Failure)

            val error = (result as ApiResult.Failure).error as ApiError.InvalidContract
            val names = case["names"]?.jsonPrimitive?.content
            if (names != null) {
                assertTrue("${case.name()} names $names, not ${error.field}", error.field.orEmpty().contains(names))
            }
        }
    }

    private fun payload(case: JsonObject): JsonObject {
        val file = File(directory, "${case.name()}.json")
        assertTrue("${case.name()}: ${file.path} is missing", file.exists())
        return ContractCodec.json.parseToJsonElement(file.readText()).jsonObject
    }

    private fun body(case: JsonObject): String = payload(case).getValue("body").toString()

    private fun JsonObject.name(): String = getValue("name").jsonPrimitive.content

    private fun JsonObject.expectation(): String = getValue("expect").jsonPrimitive.content

    /**
     * The fixtures live in the repository beside the contract they describe, not
     * in the app's resources: one file read by both clients is the point, so the
     * suite walks up from whatever directory Gradle runs it in.
     */
    private fun fixturesDirectory(): File {
        val start = File(System.getProperty("user.dir") ?: ".").absoluteFile
        var candidate: File? = start
        while (candidate != null) {
            val fixtures = File(candidate, "shared/fixtures/contracts/my-usage")
            if (fixtures.isDirectory) return fixtures
            candidate = candidate.parentFile
        }
        throw IllegalStateException("shared/fixtures/contracts/my-usage not found above $start")
    }
}
