package com.royaraqamia.app.shell

import com.royaraqamia.app.home.HomeServicesCatalog
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Test

/**
 * The apps sheet offers the site's nine apps, and only the nine (#1194, ADR-0146).
 *
 * The sheet is the picker, so its row list is also the set of apps a member can
 * add to the homepage. `/verify` and `/mcp/guide` kept their copy and glyph
 * because the screens still draw them, but they left the picker (ADR-0152), and
 * the marketplace is not one of our apps (ADR-0155) — a row for any of them would
 * be an offer the catalog cannot honour, and `/verify` on the strip would be a
 * tab whose app is not the app door's.
 *
 * `docs/mobile/parity.json` pairs the words and the glyphs; this pins the list
 * itself, which no checker reads.
 */
class ServicesRowsTest {
    /** The nine, in the order the site ships them. */
    private val nine =
        listOf(
            "/news",
            "/rates",
            "/scan",
            "/quran",
            "/athkar",
            "/linksnap",
            "/habitflow",
            "/spendtrack",
            "/notes",
        )

    @Test
    fun `the picker offers the site's nine apps in its order`() {
        assertEquals(nine, ServicesEntry.rows.map { it.route })
    }

    @Test
    fun `verify, the guide and the marketplace are never rows a member can add`() {
        val offered = ServicesEntry.rows.map { it.route }.toSet()
        assertFalse("/verify is not a picker row", offered.contains("/verify"))
        assertFalse("/mcp/guide is not a picker row", offered.contains("/mcp/guide"))
        assertFalse("/mcp/apps is not a picker row", offered.contains("/mcp/apps"))
        assertFalse("the trigger is not a picker row", offered.contains("#apps"))
    }

    @Test
    fun `every row the picker offers is a row the catalog can store`() {
        assertEquals(nine, HomeServicesCatalog.routes)
        for (entry in ServicesEntry.rows) {
            assertNotNull("${entry.route} has no contract key", HomeServicesCatalog.keyOf(entry))
        }
    }
}
