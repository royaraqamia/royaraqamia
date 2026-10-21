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
 * - `lastFlush()` — the app's WebView reads back when the shell last delivered
 *   and what it pulled, the record `SyncFlushRecord` persists (#455). It states
 *   facts the user already owns, nothing more.
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

    /** Reads the last flush back; null says "the shell has no record". */
    interface Last {
        String last();
    }

    private final Runnable schedule;
    private final Reporter reporter;
    private final Last last;

    ShellSyncBridge(Runnable schedule, Reporter reporter, Last last) {
        this.schedule = schedule;
        this.reporter = reporter;
        this.last = last;
    }

    /** What the app's WebView gets: scheduling and reading the record back. */
    static ShellSyncBridge forApp(Runnable schedule, Last last) {
        return new ShellSyncBridge(schedule, json -> {}, last);
    }

    /** What the drain page gets: it is the drain, so it only reports. */
    static ShellSyncBridge forDrain(Reporter reporter) {
        return new ShellSyncBridge(() -> {}, reporter, () -> null);
    }

    @JavascriptInterface
    public void schedule() {
        schedule.run();
    }

    @JavascriptInterface
    public void report(String json) {
        reporter.onReport(json);
    }

    @JavascriptInterface
    public String lastFlush() {
        return last.last();
    }
}
