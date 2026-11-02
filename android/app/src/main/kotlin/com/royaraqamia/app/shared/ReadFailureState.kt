package com.royaraqamia.app.shared

/**
 * The two faces of a refused read (#658).
 *
 * The site's `ReadFailureNotice` has three, and the third is not here on
 * purpose: a request that never reached the server is [NeedsConnection]'s
 * offline face — the site routes it there too — and a client that cannot tell
 * "the check did not run" from "the server said no" is the lie ADR-0031 forbids.
 */
sealed interface ReadFailureState {
    /** A whole panel's worth: the read that fills it failed. */
    data object Failed : ReadFailureState

    /** Where a control failed: under a "load more", inside a suggestions list. */
    data object FailedInline : ReadFailureState
}
