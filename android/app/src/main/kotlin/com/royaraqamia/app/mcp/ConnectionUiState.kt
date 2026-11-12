package com.royaraqamia.app.mcp

import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult

/**
 * The connection screen's four answers (#1256).
 *
 * Two things are deliberately not states:
 *
 * - **Reading.** The screen holds a nullable state, so a read in flight is the
 *   skeleton and every state here is an outcome the member can act on.
 * - **A guest.** No session is the screen's precondition, not a read: the sign-in
 *   card is drawn before any request is sent, so it has no place in a value that
 *   only exists once something was asked.
 *
 * The names are the parity row's states, so a state one client can draw and the
 * other cannot is a failing check rather than a member's surprise. [NotFound] is
 * its own state because a connection that is not the member's is not a failure to
 * retry: the page says «هذا التطبيق غير مرتبط بحسابك» and stops.
 */
sealed interface ConnectionUiState {
    /** The server says this connection is not on this account. */
    data object NotFound : ConnectionUiState

    /** The request never reached the server: the member's connection, not ours. */
    data object Offline : ConnectionUiState

    /** The server refused, or answered a body the app could not read. */
    data object Failed : ConnectionUiState

    /** The connection, its grant and its tools. */
    data class Ready(val detail: ConnectionDetail) : ConnectionUiState

    companion object {
        fun from(result: ApiResult<ConnectionDetail>): ConnectionUiState =
            when (result) {
                is ApiResult.Success -> Ready(result.value)
                is ApiResult.Failure ->
                    when (val error = result.error) {
                        // A read that answers "no session" after `signedIn` said
                        // otherwise is a retryable failure, not the guest card: the
                        // screen already decided the member was signed in.
                        ApiError.NotSignedIn -> Failed
                        is ApiError.Network -> Offline
                        // A 404 is the connection's own answer, not an outage.
                        is ApiError.Server ->
                            if (error.status == 404) NotFound else Failed
                        is ApiError.InvalidContract -> Failed
                    }
            }
    }
}
