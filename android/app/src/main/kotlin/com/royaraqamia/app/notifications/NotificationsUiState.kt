package com.royaraqamia.app.notifications

import com.royaraqamia.app.chats.ChatFailure
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.NotificationsResponseNotificationsItem

/**
 * What the notification centre can show (#1391): the page's four faces — the
 * spinner, the guest's way in, the failure, and the feed (empty or not).
 *
 * They are separate cases because the screen's next move differs in each. The
 * page draws a guest prompt rather than an empty list, and a failed read is not
 * "you have no notifications" (ADR-0031): it keeps the server's own sentence
 * when it gave one and offers one retry.
 *
 * [Ready] carries the rows rather than a flag, so "the feed" and "nothing yet"
 * are one state with two renderings, exactly as the page's
 * `notifications.length === 0` decides.
 */
sealed interface NotificationsUiState {
    /** The read is out; the screen draws the page's spinner. */
    data object Loading : NotificationsUiState

    /** There is no session, so there is no feed to read. */
    data object SignedOut : NotificationsUiState

    /** The read did not produce a feed; [message] is the server's words, if any. */
    data class Failed(val message: String?) : NotificationsUiState

    /** The server's rows, newest first, which may be empty. */
    data class Ready(val notifications: List<NotificationsResponseNotificationsItem>) :
        NotificationsUiState {
        val isEmpty: Boolean
            get() = notifications.isEmpty()
    }

    companion object {
        fun from(
            result: ApiResult<List<NotificationsResponseNotificationsItem>>
        ): NotificationsUiState =
            when (result) {
                is ApiResult.Success -> Ready(result.value)
                is ApiResult.Failure ->
                    when (val error = result.error) {
                        ApiError.NotSignedIn -> SignedOut
                        // The transport hands a failed request the raw body, so
                        // the server's Arabic sentence is read out of it rather
                        // than drawn as JSON; a body with none is the screen's copy.
                        is ApiError.Server -> Failed(ChatFailure.sentenceOf(error))
                        is ApiError.Network,
                        is ApiError.InvalidContract -> Failed(null)
                    }
            }
    }
}
