package com.royaraqamia.app;

import android.webkit.JavascriptInterface;

/**
 * The one object the shell injects into a page as `RoyShellSync` (ADR-0059).
 *
 * It carries the directions of the background drain, and nothing else — no
 * data, no credentials, no way to act on the queue itself:
 *
 * - `schedule()` — the app's WebView says a write was left queued, so the shell
 *   enqueues its drain. It is a *signal*; the replay happens in the headless page
 *   that runs the same engine as a tab, so the shell never grows a second writer.
 * - `report(json)` — the drain page says which products were drained and what is
 *   left, which is what ends the worker's wait.
 *
 * The worker's copy of this bridge answers `schedule()` with nothing, because a
 * drain asking for another drain is how a queue would spend its life scheduling
 * itself.
 */
final class ShellSyncBridge {

    /** The name the page reads the interface from. Also the page's name for it. */
    static final String NAME = "RoyShellSync";

    interface Reporter {
        void onReport(String json);
    }

    private final Runnable schedule;
    private final Reporter reporter;

    ShellSyncBridge(Runnable schedule, Reporter reporter) {
        this.schedule = schedule;
        this.reporter = reporter;
    }

    /** What the app's WebView gets: scheduling only. */
    static ShellSyncBridge forApp(Runnable schedule) {
        return new ShellSyncBridge(schedule, json -> {});
    }

    /** What the drain page gets: it is the drain, so it only reports. */
    static ShellSyncBridge forDrain(Reporter reporter) {
        return new ShellSyncBridge(() -> {}, reporter);
    }

    @JavascriptInterface
    public void schedule() {
        schedule.run();
    }

    @JavascriptInterface
    public void report(String json) {
        reporter.onReport(json);
    }
}
