package com.royaraqamia.app.shell

import org.junit.After
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

/**
 * The escape hatch's one question (#661): is this route one the remote switch sent
 * to the system browser?
 *
 * Off is the app as shipped and must stay the answer for every other surface, so
 * these tests are mostly about what a name does *not* catch. The route grammar is
 * the generated `Screens` registry (ADR-0181), which is what lets a surface id
 * cover a dynamic route a single path could not.
 */
class BrowserEscapeTest {
    @Before
    fun setUp() {
        BrowserEscape.clear()
    }

    @After
    fun tearDown() {
        BrowserEscape.clear()
    }

    @Test
    fun `off by default`() {
        assertFalse(BrowserEscape.opensInBrowser("/rates"))
        assertFalse(BrowserEscape.opensInBrowser("/community"))
    }

    @Test
    fun `a surface name covers its whole surface`() {
        BrowserEscape.publish(setOf("community"))

        assertTrue(BrowserEscape.opensInBrowser("/community"))
        assertTrue(BrowserEscape.opensInBrowser("/community/explore"))
        // The post is its own surface, so naming the feed does not take it too.
        assertFalse(BrowserEscape.opensInBrowser("/community/a-post"))
        assertFalse(BrowserEscape.opensInBrowser("/rates"))
    }

    @Test
    fun `a surface name covers the routes a path could not`() {
        BrowserEscape.publish(setOf("profile"))

        assertTrue(BrowserEscape.opensInBrowser("/u/royar"))
        assertTrue(BrowserEscape.opensInBrowser("/u/royar/followers"))
    }

    @Test
    fun `a route name switches one page`() {
        BrowserEscape.publish(setOf("/community/explore"))

        assertTrue(BrowserEscape.opensInBrowser("/community/explore"))
        // The route is narrower than the surface it belongs to.
        assertFalse(BrowserEscape.opensInBrowser("/community"))
    }

    @Test
    fun `the door's app address is the route the caller resolves`() {
        BrowserEscape.publish(setOf("rates"))

        // ShellActivity turns `/?tab=/rates` into `/rates` with Routes.appTabOf,
        // so the switch only has to know the route the door names (ADR-0151).
        assertTrue(BrowserEscape.opensInBrowser("/rates"))
        // The door itself is home, which the switch did not name.
        assertFalse(BrowserEscape.opensInBrowser("/"))
    }

    @Test
    fun `a route name is read the way the shell reads it`() {
        BrowserEscape.publish(setOf("/rates/"))

        assertTrue(BrowserEscape.opensInBrowser("/rates"))
    }

    @Test
    fun `publishing reports whether the switch moved`() {
        assertTrue(BrowserEscape.publish(setOf("rates")))
        assertFalse(BrowserEscape.publish(setOf(" rates ")))
        assertTrue(BrowserEscape.clear())
        assertFalse(BrowserEscape.clear())
    }

    @Test
    fun `turning the switch off restores the native screen`() {
        BrowserEscape.publish(setOf("rates"))
        assertTrue(BrowserEscape.opensInBrowser("/rates"))

        BrowserEscape.clear()
        assertFalse(BrowserEscape.opensInBrowser("/rates"))
    }

    @Test
    fun `an unknown name catches nothing`() {
        BrowserEscape.publish(setOf("not-a-surface"))

        assertFalse(BrowserEscape.opensInBrowser("/rates"))
        assertFalse(BrowserEscape.opensInBrowser("/community"))
    }
}
