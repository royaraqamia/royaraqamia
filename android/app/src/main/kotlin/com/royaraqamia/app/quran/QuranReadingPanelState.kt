package com.royaraqamia.app.quran

/** The states the resume-and-marks panel can be in, as the site draws them (#1751). */
sealed interface QuranReadingPanelState {
    data object AtRest : QuranReadingPanelState
}
