package com.royaraqamia.app.scan

/**
 * The three states the visual gate records for the Scanner (#1707, ADR-0118).
 *
 * The page and the app both draw an at-rest scanner, a denied one and a result.
 * Naming them here lets the parity row list the same three states the gate
 * measures, rather than a second vocabulary that drifts from it.
 */
internal sealed interface ScanVisualState {
    data object AtRest : ScanVisualState

    data object Denied : ScanVisualState

    data object Result : ScanVisualState
}
