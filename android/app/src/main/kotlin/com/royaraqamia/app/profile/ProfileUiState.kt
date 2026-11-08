package com.royaraqamia.app.profile

import com.royaraqamia.app.contracts.generated.CommunityMemberResponseMember
import com.royaraqamia.app.contracts.generated.CommunityMemberResponsePostsItem

/**
 * What one member's profile is showing (#927).
 *
 * The site's page has three faces the server decides: a member with posts, a
 * member with none (the page's empty card), and the root not-found page for a
 * handle that is unknown or hidden (ADR-0127). The app keeps the same three.
 *
 * A read that did not reach an answer is not a fourth face of the profile — it
 * is the shared read-failure/needs-connection notice, drawn over the same screen
 * — so it stays out of this interface rather than gaining a sentence the page
 * never says (ADR-0031).
 *
 * A sealed interface so `docs/mobile/parity.json` can hold the three states
 * against the page's, and `check:parity` fails one the other side does not draw.
 */
sealed interface ProfileUiState {
    /** The member the server answered, and the posts they published. */
    data class AtRest(
        val member: CommunityMemberResponseMember,
        val posts: List<CommunityMemberResponsePostsItem>,
    ) : ProfileUiState

    /** The member, but no published posts: the page's empty card under the header. */
    data class Empty(val member: CommunityMemberResponseMember) : ProfileUiState

    /** The server answered, and has no visible member under this handle. */
    data class NotFound(val username: String) : ProfileUiState

    companion object {
        /** One read as a state; `null` is a read that did not reach an answer. */
        fun of(result: ProfileResult, username: String): ProfileUiState? =
            when (result) {
                is ProfileResult.Live ->
                    if (result.profile.posts.isEmpty()) {
                        Empty(result.profile.member)
                    } else {
                        AtRest(result.profile.member, result.profile.posts)
                    }
                ProfileResult.NotFound -> NotFound(username)
                is ProfileResult.Unavailable -> null
            }
    }
}
