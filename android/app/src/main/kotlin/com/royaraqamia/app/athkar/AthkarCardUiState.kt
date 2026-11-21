package com.royaraqamia.app.athkar

/**
 * The counter's two faces (#1670).
 *
 * A used-up counter is not removed from the semantics tree: Compose's
 * `clickable(enabled = false)` keeps the button's node and marks it disabled,
 * the way the site keeps an `aria-disabled` button in the tab order. Naming the
 * face here lets `docs/mobile/parity.json` check the pair instead of assuming
 * that the two clients mean the same thing by "complete".
 */
sealed interface AthkarCardUiState {
    data object AtRest : AthkarCardUiState
    data object Completed : AthkarCardUiState
}
