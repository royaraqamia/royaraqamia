package com.royaraqamia.app.profile

import com.royaraqamia.app.contracts.generated.FollowToggleResponseState

/**
 * The five faces the follow control draws, one per standing and one for the
 * viewer's own page.
 *
 * A sealed interface rather than the response enum, because two of the faces
 * are not follow states: [Self] is "there is nothing to press" (the site's «أنت»
 * pill) and [Guest] is "press it and the sign-in question answers". The parity
 * manifest holds these names against the page's, so a face one client draws and
 * the other does not is a failing check rather than a difference nobody saw.
 */
sealed interface FollowButtonUiState {
    data object Self : FollowButtonUiState

    data object NotFollowing : FollowButtonUiState

    data object Following : FollowButtonUiState

    data object Blocked : FollowButtonUiState

    data object Guest : FollowButtonUiState

    companion object {
        /** The face [standing] draws, or null when there is nothing to draw yet. */
        fun of(standing: ProfileStanding): FollowButtonUiState? =
            when (standing) {
                ProfileStanding.Loading -> null
                ProfileStanding.Unavailable -> null
                ProfileStanding.Guest -> Guest
                is ProfileStanding.Known ->
                    when (standing.state) {
                        FollowToggleResponseState.SELF -> Self
                        FollowToggleResponseState.FOLLOWING -> Following
                        FollowToggleResponseState.NOT_FOLLOWING -> NotFollowing
                        FollowToggleResponseState.BLOCKED -> Blocked
                    }
            }
    }
}
