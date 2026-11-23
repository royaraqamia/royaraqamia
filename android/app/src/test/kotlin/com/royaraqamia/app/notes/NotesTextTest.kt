package com.royaraqamia.app.notes

import com.royaraqamia.app.plans.PlanDates
import java.time.Instant
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The notes stamps, held to the site's words and thresholds (ADR-0104).
 *
 * The list and the editor no longer build a sentence from pieces: the shared
 * [com.royaraqamia.app.shared.timeAgoParts] answers a unit and a count, and this
 * surface chooses one of its two generated copy sources. The assertions read the
 * generated constants rather than retyping the Arabic, so a copy edit cannot
 * leave a hardcoded sentence behind in Kotlin.
 */
class NotesTextTest {
    private val now = Instant.parse("2026-10-30T12:00:00.000Z")

    @Test
    fun `a thirteen-day-old note reads as one week in the list's words`() {
        assertEquals(
            NotesListCopy.AGO_WEEKS.replace("{count}", "1"),
            NotesText.listTimeAgo("2026-10-17T12:00:00.000Z", now),
        )
    }

    @Test
    fun `the list picks the unit and count the site picks`() {
        assertEquals(NotesListCopy.AGO_NOW, NotesText.listTimeAgo("2026-10-30T11:59:30Z", now))
        assertEquals(
            NotesListCopy.AGO_MINUTES.replace("{count}", "5"),
            NotesText.listTimeAgo("2026-10-30T11:55:00Z", now),
        )
        assertEquals(
            NotesListCopy.AGO_HOURS.replace("{count}", "3"),
            NotesText.listTimeAgo("2026-10-30T09:00:00Z", now),
        )
        assertEquals(
            NotesListCopy.AGO_DAYS.replace("{count}", "2"),
            NotesText.listTimeAgo("2026-10-28T12:00:00Z", now),
        )
        assertEquals(
            NotesListCopy.AGO_WEEKS.replace("{count}", "3"),
            NotesText.listTimeAgo("2026-10-07T12:00:00Z", now),
        )
    }

    @Test
    fun `a month-old note is the Hijri day the site prints`() {
        val iso = "2026-08-01T12:00:00.000Z"

        assertEquals(PlanDates.label(iso), NotesText.listTimeAgo(iso, now))
        assertEquals(PlanDates.label(iso), NotesText.editorTimeAgo(iso, now))
    }

    @Test
    fun `the editor uses its own copy for the same stamp`() {
        assertEquals(
            NotesCopy.AGO_WEEKS.replace("{count}", "1"),
            NotesText.editorTimeAgo("2026-10-17T12:00:00.000Z", now),
        )
        assertEquals(
            NotesCopy.AGO_MINUTES.replace("{count}", "5"),
            NotesText.editorTimeAgo("2026-10-30T11:55:00Z", now),
        )
    }

    @Test
    fun `a count is ASCII, whatever the device's locale is`() {
        val minutes = NotesText.listTimeAgo("2026-10-30T11:55:00Z", now)

        assertFalse(minutes.any { it in '\u0660'..'\u0669' || it in '\u06F0'..'\u06F9' })
        assertTrue(minutes.contains("5"))
    }
}
