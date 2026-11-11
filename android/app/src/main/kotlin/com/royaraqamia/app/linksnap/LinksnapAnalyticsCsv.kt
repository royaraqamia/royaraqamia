package com.royaraqamia.app.linksnap

import com.royaraqamia.app.contracts.generated.LinksnapAnalyticsExportResponseRowsItem

/**
 * The analytics CSV the page downloads and the app shares (#964).
 *
 * The columns and their order are the page's `buildCsv`
 * (`frontend/ui/linksnap/csv-export.ts`), and a cell that leads with a formula
 * character is defused before it is quoted, because the referrer is whatever a
 * visitor chose to send. The bytes carry the UTF-8 BOM the page's download adds,
 * so a spreadsheet opens Arabic text as text on both clients.
 */
internal object LinksnapAnalyticsCsv {
    const val HEADER = "Clicked At,Referrer,Country,Device,OS,Browser"

    private val FORMULA_LEAD = Regex("""^[=+\-@\t\r]""")

    fun build(rows: List<LinksnapAnalyticsExportResponseRowsItem>): String {
        val lines =
            buildList {
                add(HEADER)
                rows.forEach { row ->
                    add(
                        listOf(
                                escape(row.clickedAt),
                                escape(row.referrer),
                                escape(row.ipCountry),
                                escape(row.device),
                                escape(row.os),
                                escape(row.browser),
                            )
                            .joinToString(",")
                    )
                }
            }
        return "\uFEFF" + lines.joinToString("\n")
    }

    /** The page's one CSV-cell rule: defuse a formula lead, then quote when needed. */
    private fun escape(value: String?): String {
        val text = value ?: ""
        val defused = if (FORMULA_LEAD.containsMatchIn(text)) "'$text" else text
        return if (defused.any { it == '"' || it == ',' || it == '\n' || it == '\r' }) {
            "\"" + defused.replace("\"", "\"\"") + "\""
        } else {
            defused
        }
    }
}
