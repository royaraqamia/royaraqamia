package com.royaraqamia.app.community

/**
 * The limits the site's composer and editor both enforce (#924, #925).
 *
 * The page writes them once in `post-composer-dialog.tsx` and draws both faces
 * from that one file, so the app keeps them in one place too rather than a
 * number each surface retypes. `BODY_MAX` is the counter's ceiling, and
 * `DESCRIPTION_PREVIEW` is how much of the Markdown-stripped body the feed's
 * preview carries.
 */
internal object CommunityLimits {
    /** The site's `BODY_MAX`. */
    const val BODY_MAX = 20_000

    /** The site's `DESCRIPTION_PREVIEW`. */
    const val DESCRIPTION_PREVIEW = 160
}
