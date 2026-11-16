package com.royaraqamia.app.admin

/**
 * The console index's one state (#974).
 *
 * The section list is static: the page draws it from its own array, and there is
 * no read behind it. The only thing the app asks the server is whether the caller
 * is an admin (`GET /api/me`), and that answer decides whether this screen is
 * drawn at all - a non-admin is turned away before it is composed, exactly as the
 * page's layout redirects them (ADR-0193).
 *
 * It is declared rather than left implicit because `docs/mobile/parity.json` lists
 * the states a port draws, and `check:parity` fails a state that exists on one
 * side only (ADR-0118).
 */
sealed interface AdminConsoleState {
    /** The console's section index, with the rows the review allows. */
    data object AtRest : AdminConsoleState
}
