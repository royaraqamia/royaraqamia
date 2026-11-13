package com.royaraqamia.app.profile

import com.royaraqamia.app.contracts.generated.FollowToggleResponseState

/**
 * The viewer's standing with the member whose profile is open.
 *
 * The site renders this with the document, so its page never has a "not known
 * yet" face; the app reads it beside the profile, so it does. [Unavailable] is
 * a read that failed for a reason the screen cannot turn into a control — a
 * follow button whose state is unknown would offer an action that may be about
 * to say the opposite — and [Guest] is the site's own gate: the buttons are
 * drawn and the press becomes the sign-in question.
 */
sealed interface ProfileStanding {
    data object Loading : ProfileStanding

    data object Guest : ProfileStanding

    data object Unavailable : ProfileStanding

    data class Known(val state: FollowToggleResponseState) : ProfileStanding
}
