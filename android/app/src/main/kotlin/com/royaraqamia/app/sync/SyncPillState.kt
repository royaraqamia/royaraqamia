package com.royaraqamia.app.sync

/**
 * The sync pill's states (#649), the app's half of
 * `frontend/ui/shared/sync-status-pill.tsx`.
 *
 * Only three of the site's five are here: the app holds no writes until #650, so
 * "failed" and "pending" describe a queue it cannot have yet. A state the app
 * cannot enter is not declared — #650 adds them with the outbox that makes them
 * real.
 */
sealed interface SyncPillState {
    /** The radio is off. Rows still paint; nothing can reach the server. */
    data object Offline : SyncPillState

    /** The pull was attempted and the server never answered. */
    data object RefreshFailed : SyncPillState

    /** A pull is in flight. */
    data object Syncing : SyncPillState
}
