package com.royaraqamia.app.account

import com.royaraqamia.app.chats.ChatFailure
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult

/**
 * What the blocked-members screen can show (#977, ADR-0098): the four faces the
 * page draws — the spinner, the guest's way in, the failure and the list (empty
 * or not).
 *
 * They are separate cases because the screen's next move differs in each, and
 * because the page draws them separately: a guest is pointed at sign-in rather
 * than shown an empty list, and a failure keeps the server's own sentence when it
 * gave one. [Ready] carries the list itself rather than a flag, so "blocked
 * members" and "blocked nobody" are one state with two renderings, which is what
 * the page's `members.length === 0` decides.
 *
 * [from] is the whole decision in one place, so the screen is a rendering of this
 * value and a test can hold every branch without a Compose runtime.
 */
sealed interface BlockedMembersUiState {
    /** The read is out; the screen draws the page's spinner. */
    data object Loading : BlockedMembersUiState

    /** There is no session, so there is no list to read. */
    data object SignedOut : BlockedMembersUiState

    /** The read did not produce a list; [message] is the server's words, if any. */
    data class Failed(val message: String?) : BlockedMembersUiState

    /** The server's list, which may be empty. */
    data class Ready(val members: List<BlockedMember>) : BlockedMembersUiState {
        val isEmpty: Boolean
            get() = members.isEmpty()
    }

    companion object {
        fun from(result: ApiResult<List<BlockedMember>>): BlockedMembersUiState =
            when (result) {
                is ApiResult.Success -> Ready(result.value)
                is ApiResult.Failure ->
                    when (val error = result.error) {
                        ApiError.NotSignedIn -> SignedOut
                        // The transport hands a failed request the raw body, so the
                        // server's Arabic sentence is read out of it rather than
                        // drawn as JSON; a body with none is the screen's own copy.
                        is ApiError.Server -> Failed(ChatFailure.sentenceOf(error))
                        is ApiError.Network,
                        is ApiError.InvalidContract -> Failed(null)
                    }
            }
    }
}
