package com.royaraqamia.app.athkar

/**
 * The Athkar screen's only state (#1389).
 *
 * The page is static reading: once the vendored text is read there is no
 * request, no retry and no empty collection, so the screen settles on one face.
 * The type exists so `docs/mobile/parity.json` can pair the state with the
 * page's own strings, the way every other ported component does.
 */
sealed interface AthkarUiState {
    data object AtRest : AthkarUiState
}
