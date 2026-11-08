package com.royaraqamia.app.news

import com.royaraqamia.app.api.ApiClient
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.contracts.generated.NewsBoardResponse
import com.royaraqamia.app.contracts.generated.NewsBoardResponseBoard
import com.royaraqamia.app.store.PublicSnapshotStore

/** What one digest read came to, and where the rows came from. */
sealed interface NewsDigestResult {
    /** The board the server answered just now. */
    data class Live(val board: NewsBoardResponseBoard) : NewsDigestResult

    /** The last board this device saw for the same filters, because this read failed. */
    data class Snapshot(val board: NewsBoardResponseBoard) : NewsDigestResult

    /** Neither: no answer, and nothing kept. [error] is why the read failed, when it did. */
    data class Unavailable(val error: ApiError?) : NewsDigestResult
}

/**
 * The `/news` digest and the last one this device saw (#926).
 *
 * The board is the page's own read (`GET /api/news/board`), with the same
 * `date` and `view` query the page puts in its URL. A visitor reads it with no
 * bearer; a signed-in reader sends the session's token first, because the route
 * answers the reader's own digest when they have one and the shared digest
 * otherwise. Falling back to the public read on `NotSignedIn` keeps the screen
 * usable after a session ends without turning a public read into a sign-in wall.
 *
 * Offline is the shared public-surface rule (`docs/specs/offline-first.md`): the
 * shared digest is kept in [PublicSnapshotStore] under a key that includes the
 * day and the view, so a saved Tuesday cannot be painted under Wednesday's
 * filter. Nothing reader-scoped is stored — `personal` and `preferences` are
 * stripped before the write, and a board whose active digest is the reader's own
 * is not saved at all.
 */
class NewsDigestRepository(
    private val client: ApiClient,
    private val snapshot: PublicSnapshotStore,
) {
    suspend fun board(
        date: String? = null,
        view: String = VIEW_MINE,
    ): NewsDigestResult {
        val path = pathFor(date, view)
        var failure: ApiError? = null

        when (val result = reader(path)) {
            is ApiResult.Success -> {
                val board = result.value.board
                remember(board, date, view)
                return NewsDigestResult.Live(board)
            }
            is ApiResult.Failure -> failure = result.error
        }

        val kept = snapshot.read(snapshotKey(date, view)) ?: return NewsDigestResult.Unavailable(failure)
        return when (val decoded = ContractCodec.decode<NewsBoardResponse>(kept)) {
            is ApiResult.Success -> NewsDigestResult.Snapshot(decoded.value.board)
            // A snapshot the contract can no longer read is a file from an older
            // APK, and drawing half of it would be a lie.
            is ApiResult.Failure -> NewsDigestResult.Unavailable(failure)
        }
    }

    /** The session's read when there is one, the public read otherwise. */
    private suspend fun reader(path: String): ApiResult<NewsBoardResponse> =
        when (val own = client.get<NewsBoardResponse>(path)) {
            is ApiResult.Success -> own
            is ApiResult.Failure ->
                if (own.error is ApiError.NotSignedIn) {
                    client.getPublic<NewsBoardResponse>(path)
                } else {
                    own
                }
        }

    /**
     * Keeps the shared digest the screen drew, with the reader's half removed and
     * the rows trimmed to the first screenful, as the web's snapshot does (#555).
     *
     * An active personal digest is not kept: its rows are the reader's, and a
     * snapshot is public by definition (it survives a sign-out on the device).
     */
    private fun remember(board: NewsBoardResponseBoard, date: String?, view: String) {
        if (board.personal?.active == true) return

        val day = board.day ?: return
        val stories = day.stories.take(SCREENFUL)
        if (stories.isEmpty()) return

        val stored =
            board.copy(
                day = day.copy(stories = stories),
                search = null,
                preferences = null,
                personal = null,
                cards = null,
            )
        snapshot.save(
            snapshotKey(date, view),
            ContractCodec.encodeForStorage(NewsBoardResponse(board = stored)),
        )
    }

    /** The page's own query, spelled the way its URL is. */
    private fun pathFor(date: String?, view: String): String {
        val params = buildList {
            if (date != null) add("date=$date")
            if (view == VIEW_PUBLIC) add("view=public")
        }
        return if (params.isEmpty()) BOARD_PATH else "$BOARD_PATH?${params.joinToString("&")}"
    }

    /**
     * One file per filter: the latest day, a named day, or the shared digest of
     * either. The date is `YYYY-MM-DD`, which is already a valid surface key.
     */
    private fun snapshotKey(date: String?, view: String): String =
        buildString {
            append(SNAPSHOT_SURFACE)
            if (date != null) append("-").append(date)
            if (view == VIEW_PUBLIC) append("-public")
        }

    companion object {
        const val BOARD_PATH = "/api/news/board"

        /** The reader's own digest when they have one; the route's default. */
        const val VIEW_MINE = "mine"

        /** The shared digest, even for a reader who has one. */
        const val VIEW_PUBLIC = "public"

        /** The key this surface keeps its last-seen rows under (#928). */
        const val SNAPSHOT_SURFACE = "news"

        /** How many rows a snapshot holds, matching the web's first screenful. */
        const val SCREENFUL = 16
    }
}
