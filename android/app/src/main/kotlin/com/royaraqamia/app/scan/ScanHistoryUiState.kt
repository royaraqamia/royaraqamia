package com.royaraqamia.app.scan

/**
 * What the scan-history section is drawing (ADR-0205, #1430).
 *
 * A sealed set rather than a bag of flags: the section has five states, the
 * parity row in `docs/mobile/parity.json` names exactly these, and the page's
 * component draws the same five. `Loading` keeps the heading and drops the body,
 * so the section does not jump when the read answers.
 */
internal sealed interface ScanHistoryUiState {
    /** A guest: the section says what sign-in would keep. */
    data object SignedOut : ScanHistoryUiState

    /** The first read is in flight; the heading is drawn, the body is not. */
    data object Loading : ScanHistoryUiState

    /** Signed in, the read answered, and no code kept yet. */
    data class Empty(val notice: String?) : ScanHistoryUiState

    /** The read or the clear failed, and the section says so. */
    data object Failed : ScanHistoryUiState

    /** The member's own rows, newest read first. */
    data class Ready(
        val entries: List<ScanHistoryEntry>,
        val confirming: Boolean = false,
    ) : ScanHistoryUiState
}
