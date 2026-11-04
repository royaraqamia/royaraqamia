package com.royaraqamia.app.account

/**
 * The FAQ's states (#949).
 *
 * The content is static: there is no read to fail and nothing to wait for, so the
 * screen has one state. It is declared rather than left implicit because
 * `docs/mobile/parity.json` lists the states a port draws, and `check:parity`
 * fails a state that exists on one side only (ADR-0118).
 */
sealed interface AccountFaqState {
    /** The list, with the first question open as the page leaves it. */
    data object AtRest : AccountFaqState
}
