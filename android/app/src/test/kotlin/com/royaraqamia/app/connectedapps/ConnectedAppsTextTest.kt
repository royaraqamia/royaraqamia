package com.royaraqamia.app.connectedapps

import com.royaraqamia.app.plans.PlanDates
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The card's words, held against the site's sentences (#657, ADR-0098).
 *
 * Every string here is [ConnectedAppsCopy], generated from the same file the
 * site's module comes from, so these tests assert the *choice* — which sentence a
 * value goes into, and that a count is ASCII — rather than retyping the Arabic.
 * The relative time is the interesting half: [com.royaraqamia.app.shared.timeAgoParts]
 * answers a unit and a count, and this surface is what puts them into words
 * (ADR-0104), so a boundary that moved on either client fails here.
 */
class ConnectedAppsTextTest {
    private val now = Instant.parse("2026-11-01T12:00:00Z")

    private fun app(name: String? = "Claude Code", lastUsedAt: String? = null) =
        ConnectedApp(
            clientId = "client-1",
            name = name,
            connectedAt = "2026-10-01T09:00:00.000Z",
            lastUsedAt = lastUsedAt,
        )

    @Test
    fun `an unnamed client reads as the site's generic name`() {
        assertEquals(ConnectedAppsCopy.APP_NAME, ConnectedAppsText.name(app(name = null)))
        assertEquals(ConnectedAppsCopy.APP_NAME, ConnectedAppsText.name(app(name = "  ")))
        assertEquals("OpenCode", ConnectedAppsText.name(app(name = "OpenCode")))
    }

    @Test
    fun `a client that was never used says so`() {
        assertEquals(
            "${ConnectedAppsCopy.LAST_USED} ${ConnectedAppsCopy.NEVER_USED}",
            ConnectedAppsText.lastUsed(app(lastUsedAt = null), now),
        )
    }

    @Test
    fun `a relative time picks the unit the site picks`() {
        assertEquals(
            ConnectedAppsCopy.AGO_NOW,
            ConnectedAppsText.timeAgo("2026-11-01T11:59:30Z", now),
        )
        assertEquals(
            ConnectedAppsCopy.AGO_MINUTES.replace("{count}", "5"),
            ConnectedAppsText.timeAgo("2026-11-01T11:55:00Z", now),
        )
        assertEquals(
            ConnectedAppsCopy.AGO_HOURS.replace("{count}", "3"),
            ConnectedAppsText.timeAgo("2026-11-01T09:00:00Z", now),
        )
        assertEquals(
            ConnectedAppsCopy.AGO_DAYS.replace("{count}", "2"),
            ConnectedAppsText.timeAgo("2026-10-30T12:00:00Z", now),
        )
        assertEquals(
            ConnectedAppsCopy.AGO_WEEKS.replace("{count}", "3"),
            ConnectedAppsText.timeAgo("2026-10-11T12:00:00Z", now),
        )
    }

    @Test
    fun `a month or more is the Hijri day, not a count of months`() {
        val iso = "2026-08-01T12:00:00.000Z"

        assertEquals(PlanDates.label(iso), ConnectedAppsText.timeAgo(iso, now))
    }

    @Test
    fun `a count is ASCII, whatever the device's locale is`() {
        val minutes = ConnectedAppsText.timeAgo("2026-11-01T11:55:00Z", now)

        assertFalse(minutes.any { it in '\u0660'..'\u0669' || it in '\u06F0'..'\u06F9' })
        assertTrue(minutes.contains("5"))
    }

    @Test
    fun `the connection date is the Hijri day the site prints`() {
        assertEquals(
            ConnectedAppsCopy.CONNECTED_SINCE.replace("{date}", PlanDates.label("2026-10-01T09:00:00.000Z")),
            ConnectedAppsText.connectedSince(app()),
        )
    }

    @Test
    fun `the revoke's question and its accessible name carry the client's name`() {
        assertEquals(
            ConnectedAppsCopy.CONFIRM_DISCONNECT_MESSAGE.replace("{name}", "Claude Code"),
            ConnectedAppsText.confirmMessage(app()),
        )
        assertEquals(
            ConnectedAppsCopy.DISCONNECT_ARIA.replace("{name}", ConnectedAppsCopy.APP_NAME),
            ConnectedAppsText.disconnectLabel(app(name = null)),
        )
    }
}
