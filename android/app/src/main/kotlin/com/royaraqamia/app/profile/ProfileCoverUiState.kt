package com.royaraqamia.app.profile

/**
 * What the cover band can be: painted from the member's id (ADR-0201).
 *
 * It has one state on purpose - the band is scenery and never loads, fails or
 * waits - but the pair in `docs/mobile/parity.json` names it so a future state
 * has to be declared on both clients rather than appearing in Kotlin alone.
 */
sealed interface ProfileCoverUiState {
    data object Painted : ProfileCoverUiState
}
