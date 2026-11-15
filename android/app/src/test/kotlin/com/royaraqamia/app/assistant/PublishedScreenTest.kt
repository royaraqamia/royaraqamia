package com.royaraqamia.app.assistant

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import java.time.Instant

/**
 * What the app publishes about the screen it is on (#1422, ADR-0181 decision 6).
 *
 * Three claims, and each one is a failure the member would meet rather than a
 * preference. A shell that has not navigated yet sends nothing. A route the
 * matrix does not carry still travels - the site's decision 2 - so the assistant
 * is told the path it cannot name instead of being told nothing. And an admin
 * prefix closes the eyes entirely, because carrying another member's row into a
 * prompt is the one failure this contract cannot recover from.
 */
class PublishedScreenTest {
    private val at = Instant.parse("2026-11-15T09:00:00Z")

    @Before
    fun reset() {
        PublishedScreen.clear()
    }

    @Test
    fun `a shell that has not navigated publishes nothing`() {
        assertNull(PublishedScreen.current(at))
    }

    @Test
    fun `a route the matrix carries publishes the screen id and the title it draws`() {
        PublishedScreen.follow("/habitflow")

        val published = PublishedScreen.current(at) as ScreenContextInput.Shown
        assertEquals("/habitflow", published.snapshot.route)
        assertEquals("habitflow", published.snapshot.screenId)
        assertEquals("habitflow", published.snapshot.product)
        assertEquals(ScreenTitles.of("/habitflow"), published.snapshot.title)
        assertTrue("a drawn title must not be blank", published.snapshot.title.isNotEmpty())
        assertEquals("2026-11-15T09:00:00Z", published.snapshot.updatedAt)
    }

    @Test
    fun `a route the matrix does not carry publishes route only`() {
        PublishedScreen.follow("/somewhere/else")

        val published = PublishedScreen.current(at) as ScreenContextInput.Shown
        assertEquals("/somewhere/else", published.snapshot.route)
        assertEquals("", published.snapshot.screenId)
        assertEquals("somewhere", published.snapshot.product)
        assertEquals("", published.snapshot.title)
    }

    @Test
    fun `an admin subtree publishes the sentence that says it cannot be seen`() {
        PublishedScreen.follow("/admin/members")

        assertEquals(ScreenContextInput.Blind, PublishedScreen.current(at))
    }

    @Test
    fun `the app sends no field and no excerpt until a surface registers one`() {
        PublishedScreen.follow("/rates")

        val snapshot = (PublishedScreen.current(at) as ScreenContextInput.Shown).snapshot
        assertTrue(snapshot.overlays.isEmpty())
        assertTrue(snapshot.fields.isEmpty())
        assertEquals("", snapshot.text)
        assertNull(snapshot.focus)
    }

    @Test
    fun `a sign-out forgets the route`() {
        PublishedScreen.follow("/rates")
        PublishedScreen.clear()

        assertNull(PublishedScreen.current(at))
    }
}
