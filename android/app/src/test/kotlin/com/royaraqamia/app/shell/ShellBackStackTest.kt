package com.royaraqamia.app.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The back gesture (#647, ADR-0082): it never exits from a destination the user did
 * not start at, and it is the only thing that closes the app.
 */
class ShellBackStackTest {
    @Test
    fun `back at the root closes the app`() {
        val stack = ShellBackStack()

        assertFalse(stack.back())
        assertEquals("/", stack.route)
    }

    @Test
    fun `a tab the user opened comes back to home`() {
        val stack = ShellBackStack()
        stack.open("/account")

        assertTrue(stack.back())
        assertEquals("/", stack.route)
        assertFalse(stack.back())
    }

    @Test
    fun `history pops before the URL walk does`() {
        val stack = ShellBackStack()
        stack.open("/community")
        stack.open("/account")
        stack.open("/community/post")

        assertTrue(stack.back())
        assertEquals("/account", stack.route)
        assertTrue(stack.back())
        assertEquals("/community", stack.route)
        assertTrue(stack.back())
        assertEquals("/", stack.route)
    }

    @Test
    fun `a cold launch on a deep link walks up instead of exiting`() {
        val stack = ShellBackStack("/community/post/replies")

        assertTrue(stack.back())
        assertEquals("/community/post", stack.route)
        assertTrue(stack.back())
        assertEquals("/community", stack.route)
        assertTrue(stack.back())
        assertEquals("/", stack.route)
        assertFalse(stack.back())
    }

    @Test
    fun `a cold launch on a layout-only path lands on the nearest real page`() {
        val stack = ShellBackStack("/auth/callback?code=abc")

        assertTrue(stack.back())
        assertEquals("/", stack.route)
        assertFalse(stack.back())
    }

    @Test
    fun `opening the destination already showing is not a new entry`() {
        val stack = ShellBackStack("/account/")
        stack.open("/account")

        assertEquals(1, stack.depth)
        assertTrue(stack.back())
        assertEquals("/", stack.route)
    }

    @Test
    fun `the query is kept on the target and dropped from the destination`() {
        val stack = ShellBackStack("/auth/callback?code=abc")

        assertEquals("/auth/callback?code=abc", stack.current)
        assertEquals("/auth/callback", stack.route)
    }
}
