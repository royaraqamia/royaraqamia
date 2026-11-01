package com.royaraqamia.app.sync

/**
 * The sync pill's states (#649, #650), the app's half of
 * `frontend/ui/shared/sync-status-pill.tsx`.
 *
 * All five of the site's are here. Three describe a read (#649); "pending" and
 * "failed" describe the Outbox the app holds since #650, and a state the app
 * cannot enter is still not declared — the pill shows what its queue and its
 * pull actually are.
 */
sealed interface SyncPillState {
    /** The radio is off. Rows still paint; nothing can reach the server. */
    data class Offline(val pending: Int = 0) : SyncPillState

    /** The pull was attempted and the server never answered. */
    data object RefreshFailed : SyncPillState

    /** A pull is in flight. */
    data object Syncing : SyncPillState

    /** Writes are durable and waiting for the server (#650). */
    data class Pending(val count: Int) : SyncPillState

    /** The server refused a queued write permanently; the pill offers a retry. */
    data class Failed(val count: Int) : SyncPillState
}
