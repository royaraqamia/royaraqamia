package com.royaraqamia.app;

import android.webkit.JavascriptInterface;

/**
 * The one object the app injects into the document as `RoyShellSync`.
 *
 * It carries a direction, and nothing else — no data, no credentials, no way to
 * act on a queue: `schedule()` is the page saying a write was left queued, so
 * the app enqueues its drain. The replay happens in `OutboxDrainWorker`, against
 * the Local Store's Outbox (#651); the page's own IndexedDB queue is replayed by
 * the page when it is next open, because that store is not one the app can read.
 *
 * The drain half of this interface — `report(json)`, which the headless
 * `/sync-flush.html` page called to end the worker's wait — is gone with the
 * WebView drain (#651). The served page still answers to the installed base's
 * shells, which inject their own copy of it.
 */
final class ShellSyncBridge {

    /** The name the page reads the interface from. Also the page's name for it. */
    static final String NAME = "RoyShellSync";

    private final Runnable schedule;

    ShellSyncBridge(Runnable schedule) {
        this.schedule = schedule;
    }

    /** What the document's page gets: scheduling only. */
    static ShellSyncBridge forApp(Runnable schedule) {
        return new ShellSyncBridge(schedule);
    }

    @JavascriptInterface
    public void schedule() {
        schedule.run();
    }
}
