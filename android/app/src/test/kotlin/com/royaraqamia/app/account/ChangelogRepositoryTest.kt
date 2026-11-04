package com.royaraqamia.app.account

import com.royaraqamia.app.contracts.generated.AndroidChangelog
import com.royaraqamia.app.contracts.generated.AndroidChangelogReleasesItem
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The changelog's reader (#951): what the screen is allowed to draw.
 *
 * The file is written by the weekly train and read defensively by the page, so
 * the same rules are pinned here: a release with no notes says nothing, a note
 * that is only whitespace is not a note, and the list is bounded.
 */
class ChangelogRepositoryTest {
    @Test
    fun `drops a release that has no version or no notes`() {
        val changelog =
            AndroidChangelog(
                releases =
                    listOf(
                        release("1.2.0", notes = listOf("ميزة: محادثات جماعية")),
                        release("1.1.0", notes = emptyList()),
                        release("", notes = listOf("بلا إصدار")),
                        release("1.0.0", notes = listOf("  ", "إصلاح: التحديث")),
                    )
            )

        val releases = releasesOf(changelog)

        assertEquals(listOf("1.2.0", "1.0.0"), releases.map { it.version })
        assertEquals(listOf("إصلاح: التحديث"), releases.last().notes)
    }

    @Test
    fun `keeps the file's order and bounds a long list`() {
        val changelog =
            AndroidChangelog(
                releases =
                    (0 until ChangelogRepository.PAGE_LIMIT + 5).map { index ->
                        release("1.0.$index", notes = listOf("ميزة"))
                    }
            )

        val releases = releasesOf(changelog)

        assertEquals(ChangelogRepository.PAGE_LIMIT, releases.size)
        assertEquals("1.0.0", releases.first().version)
    }

    private fun release(version: String, notes: List<String>) =
        AndroidChangelogReleasesItem(
            version = version,
            versionCode = 20200,
            releasedAt = "2026-11-02",
            notes = notes,
        )
}
