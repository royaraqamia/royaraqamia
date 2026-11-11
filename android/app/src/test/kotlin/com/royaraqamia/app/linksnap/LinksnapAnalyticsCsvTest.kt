package com.royaraqamia.app.linksnap

import com.royaraqamia.app.contracts.generated.LinksnapAnalyticsExportResponseRowsItem
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The analytics CSV (#964).
 *
 * These are the page's own cases (`frontend/ui/linksnap/__tests__/csv-export.test.ts`),
 * kept here so the two writers cannot drift: the header and column order, a null
 * cell as empty, the quote rule, and the formula lead that an attacker-controlled
 * referrer would otherwise carry into a spreadsheet.
 */
class LinksnapAnalyticsCsvTest {
    private fun row(
        referrer: String? = "https://example.com/post",
        ipCountry: String? = "SY",
        device: String = "mobile",
        os: String = "Android",
        browser: String = "Chrome",
    ) =
        LinksnapAnalyticsExportResponseRowsItem(
            clickedAt = "2026-08-01T10:00:00.000Z",
            referrer = referrer,
            ipCountry = ipCountry,
            device = device,
            os = os,
            browser = browser,
        )

    @Test
    fun `writes the header and one row per click`() {
        val csv = LinksnapAnalyticsCsv.build(listOf(row(), row(referrer = null)))

        assertEquals(
            "\uFEFF" +
                "Clicked At,Referrer,Country,Device,OS,Browser\n" +
                "2026-08-01T10:00:00.000Z,https://example.com/post,SY,mobile,Android,Chrome\n" +
                "2026-08-01T10:00:00.000Z,,SY,mobile,Android,Chrome",
            csv,
        )
    }

    @Test
    fun `quotes commas, quotes and newlines and keeps Arabic text intact`() {
        val csv =
            LinksnapAnalyticsCsv.build(
                listOf(
                    row(referrer = "شراء \"قهوة\", مساء"),
                    row(referrer = "سطر\nآخر"),
                )
            )

        assertTrue(csv.contains("\"شراء \"\"قهوة\"\", مساء\""))
        assertTrue(csv.contains("\"سطر\nآخر\""))
    }

    @Test
    fun `neutralises an attacker-controlled referrer that leads with a formula char`() {
        listOf(
                "=HYPERLINK(\"https://evil.example\",\"x\")",
                "+1+1",
                "-1+1",
                "@SUM(A1)",
                "\tx",
                "\rx",
            )
            .forEach { referrer ->
                val csv = LinksnapAnalyticsCsv.build(listOf(row(referrer = referrer)))
                val dataLine = csv.split("\n")[1]
                assertTrue(dataLine.contains("'${referrer.first()}"))
                assertFalse(Regex("(^|,)\"?[=+\\-@\\t\\r]").containsMatchIn(dataLine))
            }
    }

    @Test
    fun `neutralises a formula lead in every string column`() {
        val csv =
            LinksnapAnalyticsCsv.build(
                listOf(
                    row(
                        referrer = "=1",
                        ipCountry = "+2",
                        device = "-3",
                        os = "@4",
                        browser = "=5",
                    )
                )
            )

        assertTrue(csv.contains("'=1,'+2,'-3,'@4,'=5"))
    }
}
