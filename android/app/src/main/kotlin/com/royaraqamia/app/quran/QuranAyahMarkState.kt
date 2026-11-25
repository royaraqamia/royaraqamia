package com.royaraqamia.app.quran

/** The states the mark control can be in, as the site draws them (#1751). */
sealed interface QuranAyahMarkState {
    data object AtRest : QuranAyahMarkState
}
