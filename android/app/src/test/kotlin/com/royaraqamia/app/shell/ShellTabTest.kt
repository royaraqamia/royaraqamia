package com.royaraqamia.app.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Which tab is lit, and which route belongs to which tab (#647).
 *
 * This is the app's half of `BottomTabBar.tsx`'s `isActive` predicates. It is
 * written out because a property and a parameter named the same thing made every
 * tab answer "yes" on the device — three pills lit at once, which no screenshot
 * in the repository would have caught.
 */
class ShellTabTest {
    @Test
    fun `home is active only at home`() {
        assertTrue(ShellTab.Home.isActive("/"))
        assertTrue(ShellTab.Home.isActive("/?tab=1"))
        assertFalse(ShellTab.Home.isActive("/community"))
        assertFalse(ShellTab.Home.isActive("/account/posts"))
    }

    @Test
    fun `community keeps its tab on its own sub-routes`() {
        assertTrue(ShellTab.Community.isActive("/community"))
        assertTrue(ShellTab.Community.isActive("/community/"))
        assertTrue(ShellTab.Community.isActive("/community/a-post"))
        assertFalse(ShellTab.Community.isActive("/communitys"))
        assertFalse(ShellTab.Community.isActive("/"))
    }

    @Test
    fun `account keeps its tab from the root of the surface`() {
        // The site's own predicate is a bare `startsWith('/account')`, so this is
        // what it does; `/accounting` is not a route on either client.
        assertTrue(ShellTab.Account.isActive("/account"))
        assertTrue(ShellTab.Account.isActive("/account/plan"))
        assertFalse(ShellTab.Account.isActive("/"))
    }

    @Test
    fun `a route belongs to at most one tab`() {
        assertEquals(ShellTab.Home, ShellTab.forRoute("/"))
        assertEquals(ShellTab.Community, ShellTab.forRoute("/community/post"))
        assertEquals(ShellTab.Account, ShellTab.forRoute("/account/plan"))
        assertNull(ShellTab.forRoute("/rates"))
        assertNull(ShellTab.forRoute("/auth/callback"))
    }

    @Test
    fun `the bar has three slots, in the site's order`() {
        assertEquals(listOf("/", "/community", "/account"), ShellTab.all.map { it.route })
    }
}
