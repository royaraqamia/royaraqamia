package com.royaraqamia.app.scan

import java.io.File
import org.json.JSONArray
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The app's half of the scan-history summary (ADR-0205, #1430).
 *
 * The page builds the same record in `shared/contracts/scan-history.ts`, and the
 * two are only "the same" while something proves it: both suites read
 * `shared/fixtures/scan-history-labels.json`, so a rule changed on one side fails
 * on the other's pull request.
 */
class ScanHistorySummaryTest {
    private fun cases(): JSONArray =
        JSONArray(File("../../shared/fixtures/scan-history-labels.json").readText())

    @Test
    fun `every fixture payload summarises the same way on both clients`() {
        val cases = cases()

        assertTrue("the fixture is empty", cases.length() > 0)
        for (index in 0 until cases.length()) {
            val case = cases.getJSONObject(index)
            val payload = case.getString("payload")
            val record =
                ScanHistorySummary.of(
                    ScanClassifier.classify(payload),
                    case.getString("nativeFormat"),
                )

            assertEquals(payload, case.getString("kind").uppercase(), record.kind.name)
            assertEquals(payload, "qr_code", record.format)
            if (case.isNull("label")) {
                assertNull(payload, record.label)
            } else {
                assertEquals(payload, case.getString("label"), record.label)
            }
        }
    }

    @Test
    fun `no fixture row carries the secret it summarises`() {
        val cases = cases()

        for (index in 0 until cases.length()) {
            val case = cases.getJSONObject(index)
            val record =
                ScanHistorySummary.of(
                    ScanClassifier.classify(case.getString("payload")),
                    case.getString("nativeFormat"),
                )
            val absent = case.getJSONArray("absent")

            for (secretIndex in 0 until absent.length()) {
                assertFalse(
                    "${case.getString("payload")} leaked ${absent.getString(secretIndex)}",
                    record.toString().contains(absent.getString(secretIndex)),
                )
            }
        }
    }

    @Test
    fun `ZXing's format name and the page's are one format`() {
        assertEquals("qr_code", ScanHistorySummary.normalizeFormat("QR_CODE"))
        assertEquals("qr_code", ScanHistorySummary.normalizeFormat("QR-Code"))
        assertEquals("unknown", ScanHistorySummary.normalizeFormat("  "))
        assertEquals(32, ScanHistorySummary.normalizeFormat("x".repeat(80)).length)
    }

    @Test
    fun `a hostile label is folded and bounded`() {
        val record =
            ScanHistorySummary.of(
                ScanClassifier.classify("https://" + "a".repeat(400) + ".example"),
                "QR_CODE",
            )

        assertEquals(ScanHistorySummary.LABEL_MAX, record.label?.length)
        assertFalse(record.label.orEmpty().any { it.code < 0x20 || it.code == 0x7f })
    }
}
