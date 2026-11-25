package com.royaraqamia.app.quran

/** The states the study panel can be in, as the site draws them (#1751). */
sealed interface QuranAyahTafsirState {
    data object AtRest : QuranAyahTafsirState
    data object Loading : QuranAyahTafsirState
    data object Failed : QuranAyahTafsirState
    data object Missing : QuranAyahTafsirState
    data object Open : QuranAyahTafsirState
    data object Credit : QuranAyahTafsirState
}
