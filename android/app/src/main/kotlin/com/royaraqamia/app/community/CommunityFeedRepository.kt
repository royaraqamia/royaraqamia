package com.royaraqamia.app.community

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.contracts.generated.CommunityIndexResponse
import com.royaraqamia.app.contracts.generated.CommunityIndexResponsePostsItem
import java.net.URLEncoder

/** What the feed's first read came to, and where the rows came from. */
sealed interface CommunityFeedResult {
    /** The page the server answered just now. */
    data class Live(val page: CommunityIndexResponse) : CommunityFeedResult

    /** The last page this device saw, because this read could not be answered. */
    data class Snapshot(val page: CommunityIndexResponse) : CommunityFeedResult

    /** Neither: no answer, and nothing kept. [error] is why the read failed, when it did. */
    data class Unavailable(val error: ApiError?) : CommunityFeedResult
}

/**
 * The community feed, and the last page this device saw (#658).
 *
 * The feed is public — a visitor reads it with no account — so the read goes out
 * with no bearer ([ApiClient.getPublic]) on the route the page's own island reads
 * (`GET /api/community/index`): the same page size, the same opaque keyset
 * cursor and the same query parameter, so the app cannot show a subset the site
 * would not.
 *
 * Offline is the matrix's *snapshot*, not a second cache: the last answer is
 * kept ([CommunityFeedSnapshotStore]) and only a failed read falls back to it.
 * Paging is online-only — a page the server never answered has no rows to keep —
 * but every page that does arrive joins the snapshot, so a member who read three
 * pages yesterday sees three offline today.
 */
class CommunityFeedRepository(
    private val client: ApiClient,
    private val snapshot: CommunityFeedSnapshotStore,
) {
    /** Page one, live or from the snapshot, or neither. */
    suspend fun firstPage(): CommunityFeedResult {
        var failure: ApiError? = null
        when (val result = client.getPublic<CommunityIndexResponse>(INDEX_PATH)) {
            is ApiResult.Success -> {
                // Kept before it is shown: a read the server answered is what
                // makes the next offline visit honest.
                remember(result.value.posts, result.value.nextCursor)
                return CommunityFeedResult.Live(result.value)
            }
            is ApiResult.Failure -> failure = result.error
        }

        val kept = snapshot.read() ?: return CommunityFeedResult.Unavailable(failure)
        return when (val decoded = ContractCodec.decode<CommunityIndexResponse>(kept)) {
            is ApiResult.Success -> CommunityFeedResult.Snapshot(decoded.value)
            // A snapshot the contract can no longer read is not the feed: it is
            // a file from an older APK, and drawing half of it would be a lie.
            is ApiResult.Failure -> CommunityFeedResult.Unavailable(failure)
        }
    }

    /** The page after [cursor]; paging needs the server. */
    suspend fun page(cursor: String): ApiResult<CommunityIndexResponse> =
        client.getPublic(INDEX_PATH + "?cursor=" + encode(cursor))

    /**
     * Keeps what the screen is showing as the next snapshot — the merged rows and
     * the cursor after them, so the file is the feed as this device paints it
     * rather than only the page that happened to arrive last.
     */
    fun remember(posts: List<CommunityIndexResponsePostsItem>, nextCursor: String?) {
        snapshot.save(
            ContractCodec.encode(CommunityIndexResponse(posts = posts, nextCursor = nextCursor))
        )
    }

    private fun encode(value: String): String = URLEncoder.encode(value, "UTF-8")

    companion object {
        const val INDEX_PATH = "/api/community/index"
    }
}
