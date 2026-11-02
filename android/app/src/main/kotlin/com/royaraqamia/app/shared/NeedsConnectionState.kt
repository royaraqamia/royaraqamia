package com.royaraqamia.app.shared

/**
 * The density a needs-connection block is drawn at (#658).
 *
 * The site's component takes the same two: `block` is the state of a whole page
 * or panel, `inline` is the same statement where a control failed — under a
 * "load more", inside a form — without pushing the rest of the surface around.
 * The words do not change between them; only the height does.
 */
sealed interface NeedsConnectionState {
    data object Block : NeedsConnectionState

    data object Inline : NeedsConnectionState
}
