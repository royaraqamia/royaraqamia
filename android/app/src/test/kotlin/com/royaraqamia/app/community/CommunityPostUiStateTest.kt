package com.royaraqamia.app.community

import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.generated.CommunityPostResponse
import com.royaraqamia.app.contracts.generated.CommunityPostResponsePost
import com.royaraqamia.app.contracts.generated.CommunityPostResponsePostStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/** The post's two faces, pinned (#922). */
class CommunityPostUiStateTest {
    private val post =
        CommunityPostResponsePost(
            id = "p-1",
            author_id = "u-1",
            slug = "first-post",
            content = "## مرحبًا",
            status = CommunityPostResponsePostStatus.PUBLISHED,
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
    fun `a live read is the post`() {
        val response = CommunityPostResponse(post = post, postTags = emptyList())

        assertEquals(
            CommunityPostUiState.AtRest(response),
            CommunityPostUiState.of(CommunityPostResult.Live(response), "first-post"),
        )
    }

    @Test
    fun `a missing post keeps the slug the link carried`() {
        assertEquals(
            CommunityPostUiState.NotFound("missing-post"),
            CommunityPostUiState.of(CommunityPostResult.NotFound, "missing-post"),
        )
    }

    @Test
    fun `a read that did not answer is not a post state`() {
        assertNull(
            CommunityPostUiState.of(
                CommunityPostResult.Unavailable(ApiError.Network("offline")),
                "first-post",
            )
        )
        assertTrue(
            CommunityPostUiState.of(
                CommunityPostResult.Unavailable(ApiError.Server(500, "boom")),
                "first-post",
            ) == null
        )
    }
}
