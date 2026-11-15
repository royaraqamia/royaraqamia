package com.royaraqamia.app.assistant

import com.royaraqamia.app.shell.NativeSurfaces
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Every route the shell draws has answered the title question (#1422).
 *
 * The site's title is the page's metadata, which every page has. The app has no
 * such thing, so its title is the constant the screen paints - and the routes
 * where there is no such constant say so, with the reason, in `untitled`. This
 * check is what keeps "no title" a decision instead of a blank: a ported screen
 * that adds a route has to land in one of the two tables, and the compiler
 * cannot ask that question on its own.
 */
class ScreenTitlesTest {
    @Test
    fun `a native route is either titled or written down as untitled`() {
        for (route in NativeSurfaces.declaredRoutes()) {
            val titled = ScreenTitles.of(route).isNotEmpty()
            val untitled = ScreenTitles.untitled.containsKey(route)

            assertTrue(
                "$route must be in exactly one table: titled=$titled, untitled=$untitled",
                titled != untitled,
            )
        }
    }

    @Test
    fun `an untitled entry carries the reason it has none`() {
        for ((route, reason) in ScreenTitles.untitled) {
            assertTrue("$route needs a reason", reason.isNotBlank())
            assertEquals("$route is both titled and untitled", "", ScreenTitles.of(route))
        }
    }

    @Test
    fun `a certificate keeps its section's title`() {
        assertTrue(ScreenTitles.of("/verify/ABC-123").isNotEmpty())
    }

    @Test
    fun `a route nobody claimed still resolves to a title or to nothing, never to a guess`() {
        assertEquals("", ScreenTitles.of("/nowhere"))
    }
}
