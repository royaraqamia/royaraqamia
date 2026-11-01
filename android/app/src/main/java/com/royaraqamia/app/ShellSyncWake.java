package com.royaraqamia.app;

import java.util.Map;

/**
 * What a sync wake looks like (ADR-0059, ADR-0060).
 *
 * A wake is the background half of the cross-device hint: the foreground half is
 * a Supabase Realtime subscription the page holds while it is visible, and a
 * closed shell has no socket to hear that on. So the server sends a silent,
 * high-priority, data-only FCM message instead, and the only thing the shell
 * reads from it is the type below.
 *
 * Kept apart from the service that receives it so the decision is testable
 * without Firebase: the service is a thin Android shell around this, the way
 * `DrainDecision` is around the worker.
 */
final class ShellSyncWake {

    /**
     * Must match `FCM_SYNC_WAKE` in `backend/services/push/fcm-client.ts`.
     * `scripts/__tests__/sync-flush-page.test.mjs` holds the two to each other, so
     * a rename on one side fails a test rather than silently stopping wakes.
     */
    static final String TYPE = "sync";

    /** The data key the type travels under; FCM data values are always strings. */
    static final String TYPE_KEY = "type";

    private ShellSyncWake() {}

    /**
     * Whether this data payload is a wake.
     *
     * Everything else about the message is ignored on purpose: a hint may only
     * cause a pull, never carry work, so there is nothing else to read.
     */
    static boolean isWake(Map<String, String> data) {
        return data != null && TYPE.equals(data.get(TYPE_KEY));
    }
}
