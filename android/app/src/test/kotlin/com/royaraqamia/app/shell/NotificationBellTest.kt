package com.royaraqamia.app.shell

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The notification bell's words and its badge (#659).
 *
 * The site's `frontend/ui/shared/__tests__/notification-bell.test.tsx` is the
 * reference: the same counts, so a badge that says `99+` in the browser cannot say
 * something else in the app.
 */
class NotificationBellTest {
    @Test
    fun `an empty bell is named without a number`() {
        assertEquals(NotificationBellCopy.LABEL, notificationBellDescription(0))
        assertFalse(notificationBellDescription(0).contains("0"))
    }

    @Test
    fun `an unread bell carries the count in its name`() {
        val description = notificationBellDescription(3)

        assertTrue(description.contains("3"))
        assertTrue(description.contains(NotificationBellCopy.LABEL))
        assertFalse(description.contains("{"))
    }

    @Test
    fun `the badge is the count as ASCII digits`() {
        assertEquals("1", notificationBadgeLabel(1))
        assertEquals("12", notificationBadgeLabel(12))
        assertEquals("99", notificationBadgeLabel(99))
    }

    @Test
    fun `the badge caps at the site's 99 plus`() {
        assertEquals("99+", notificationBadgeLabel(100))
        assertEquals("99+", notificationBadgeLabel(12_345))
    }
}
