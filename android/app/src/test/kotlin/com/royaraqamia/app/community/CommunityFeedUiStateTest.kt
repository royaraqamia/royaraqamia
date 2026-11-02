package com.royaraqamia.app.community

import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.generated.CommunityIndexResponse
import com.royaraqamia.app.contracts.generated.CommunityIndexResponsePostsItem
import com.royaraqamia.app.contracts.generated.CommunityIndexResponsePostsItemStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The feed's faces, pinned (#658).
 *
 * The site distinguishes an empty feed from a read that failed, and a server that
 * refused from one that was never reached (ADR-0031). The app's states keep that
 * apart, and this is what stops a later change from folding "no posts" and
 * "offline" into one screen — the exact mistake the ADR names.
 */
class CommunityFeedUiStateTest {
    private fun item(id: String) =
        CommunityIndexResponsePostsItem(
            id = id,
            author_id = "u-1",
            slug = id,
            content = null,
            status = CommunityIndexResponsePostsItemStatus.PUBLISHED,
            cover_image = null,
            meta_title = null,
            meta_desc = null,
            published_at = null,
            publish_at = null,
            view_count = 0,
            featured = false,
            community_visible = true,
            reading_time_minutes = 1,
            created_at = "2026-01-01T00:00:00.000Z",
            updated_at = "2026-01-01T00:00:00.000Z",
        )

    @Test
    fun `a live page with rows is live, and an empty page is empty`() {
        val live = CommunityFeedUiState.of(
            CommunityFeedResult.Live(CommunityIndexResponse(listOf(item("p-1")), "c-1"))
        )
        assertEquals(
            CommunityFeedUiState.Live(listOf(item("p-1")), "c-1"),
            live,
        )

        assertEquals(
            CommunityFeedUiState.Empty,
            CommunityFeedUiState.of(CommunityFeedResult.Live(CommunityIndexResponse(emptyList(), null))),
        )
    }

    @Test
    fun `a snapshot is kept as one, and an empty snapshot is the empty feed`() {
        assertTrue(
            CommunityFeedUiState.of(
                CommunityFeedResult.Snapshot(CommunityIndexResponse(listOf(item("p-1")), null))
            ) is CommunityFeedUiState.Snapshot
        )
        assertEquals(
            CommunityFeedUiState.Empty,
            CommunityFeedUiState.of(CommunityFeedResult.Snapshot(CommunityIndexResponse(emptyList(), null))),
        )
    }

    @Test
    fun `a request that never left is offline, a refusal is not`() {
        assertEquals(
            CommunityFeedUiState.Unavailable(offline = true),
            CommunityFeedUiState.of(CommunityFeedResult.Unavailable(ApiError.Network("offline"))),
        )
        val refused =
            CommunityFeedUiState.of(CommunityFeedResult.Unavailable(ApiError.Server(500, "boom")))
        assertTrue(refused is CommunityFeedUiState.Unavailable)
        assertFalse((refused as CommunityFeedUiState.Unavailable).offline)
    }
}
