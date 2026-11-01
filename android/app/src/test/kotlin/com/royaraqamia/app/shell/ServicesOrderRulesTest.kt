package com.royaraqamia.app.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * The services sheet's order, as rules (#806).
 *
 * The site's `frontend/ui/__tests__/services-order.test.ts` is the reference: the
 * same inputs, so a release that reconciles one way on the web cannot reconcile
 * another way in the app.
 */
class ServicesOrderRulesTest {
    private val shipped = listOf("/request-project", "/hire", "/news", "/rates")

    @Test
    fun `no stored order is the shipped order`() {
        assertEquals(shipped, ServicesOrderRules.resolve(shipped, null))
    }

    @Test
    fun `a stored order comes first and new rows keep their shipped place`() {
        val saved = listOf("/rates", "/request-project")

        assertEquals(
            listOf("/rates", "/request-project", "/hire", "/news"),
            ServicesOrderRules.resolve(shipped, saved),
        )
    }

    @Test
    fun `a route the release dropped disappears`() {
        val saved = listOf("/gone", "/news")

        assertEquals(
            listOf("/news", "/request-project", "/hire", "/rates"),
            ServicesOrderRules.resolve(shipped, saved),
        )
    }

    @Test
    fun `a stored order naming nothing this release ships is the shipped order`() {
        assertEquals(shipped, ServicesOrderRules.resolve(shipped, listOf("/gone", "/other")))
    }

    @Test
    fun `a duplicated store entry is one row`() {
        assertEquals(
            listOf("/hire", "/request-project", "/news", "/rates"),
            ServicesOrderRules.resolve(shipped, listOf("/hire", "/hire")),
        )
    }

    @Test
    fun `a move takes the row and leaves the rest in order`() {
        assertEquals(
            listOf("/hire", "/request-project", "/news", "/rates"),
            ServicesOrderRules.move(shipped, 0, 1),
        )
        assertEquals(
            listOf("/hire", "/news", "/rates", "/request-project"),
            ServicesOrderRules.move(shipped, 0, 3),
        )
    }

    @Test
    fun `a move out of range is refused, and a target past the end clamps`() {
        assertEquals(shipped, ServicesOrderRules.move(shipped, 9, 0))
        assertEquals(shipped, ServicesOrderRules.move(shipped, 0, 0))
        assertEquals(
            listOf("/hire", "/news", "/rates", "/request-project"),
            ServicesOrderRules.move(shipped, 0, 99),
        )
    }

    @Test
    fun `a slot is the row under the finger, clamped to the list`() {
        // Four 44px rows starting at 0: slot 0 is 0-43, slot 3 is 132-175.
        assertEquals(0, ServicesOrderRules.slotAt(10f, 0f, 44f, 4))
        assertEquals(2, ServicesOrderRules.slotAt(100f, 0f, 44f, 4))
        assertEquals(0, ServicesOrderRules.slotAt(-40f, 0f, 44f, 4))
        assertEquals(3, ServicesOrderRules.slotAt(9_000f, 0f, 44f, 4))
        assertEquals(0, ServicesOrderRules.slotAt(9_000f, 0f, 44f, 0))
    }

    @Test
    fun `the stored form is one route per line and drops what is not a route`() {
        assertEquals("/hire\n/news", ServicesOrderRules.encode(listOf("/hire", "/news")))
        assertEquals(listOf("/hire", "/news"), ServicesOrderRules.parse("/hire\n/news\n"))
        assertEquals(listOf("/hire", "/news"), ServicesOrderRules.parse("\n  /hire  \n/news"))
        assertNull(ServicesOrderRules.parse(null))
        assertNull(ServicesOrderRules.parse(""))
        assertNull(ServicesOrderRules.parse("not a route\n/\n"))
    }

    @Test
    fun `the announcement is the site's sentence with the row and slot substituted`() {
        val sentence = servicesOrderAnnouncement("الرُّسوم", 3, 16)

        assertEquals(true, sentence.contains("الرُّسوم"))
        assertEquals(true, sentence.contains("3"))
        assertEquals(true, sentence.contains("16"))
        assertEquals(false, sentence.contains("{"))
    }
}
