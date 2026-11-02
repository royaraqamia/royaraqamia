package com.royaraqamia.app.community

/**
 * What the feed card's clamped body is showing (#658).
 *
 * The site clamps a post body to four lines and offers "عرض المزيد" only when the
 * text actually overflows; expanding replaces the toggle with "عرض أقل". The app
 * has the same two states rather than a boolean, so the words come from the same
 * copy source and `docs/mobile/parity.json` can hold the pair.
 */
sealed interface PostCardState {
    /** The body at its four-line clamp, with the "show more" toggle under it. */
    data object Collapsed : PostCardState

    /** The whole body, with "show less". */
    data object Expanded : PostCardState
}
