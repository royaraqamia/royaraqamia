package com.royaraqamia.app;

import android.util.Log;

import android.webkit.JavascriptInterface;

/**
 * The object the document reports the app's own launch marks to (#1639).
 *
 * The page's `[app-perf]` beacon reaches the Render logs, but the shell cannot
 * read those logs to attribute a slow launch: what it needs is the time the
 * owned rows reached a frame, timed from the process fork like the shell's other
 * launch lines. This interface carries two numbers and nothing else — the mark
 * name and the mark's wall clock — and can do nothing but write a log line. It
 * is the same shape as `RoyShellSync` and `RoyShellUpdate`: a plain WebView
 * interface, because the Capacitor bridge is not what the launch path can
 * assume.
 */
final class ShellPerfBridge {

    /** The name the page calls this interface by. */
    static final String NAME = "RoyShellPerf";

    private final long forkWallClockMs;

    ShellPerfBridge(long forkWallClockMs) {
        this.forkWallClockMs = forkWallClockMs;
    }

    /**
     * Records one of the two launch marks on the shell's timeline.
     *
     * The page sends `performance.timeOrigin + duration`, so the number is a wall
     * clock and can be compared with the fork and with the document callbacks
     * without assuming the WebView's time origin means the same thing as the
     * process clock. Values outside a launch's plausible range are dropped
     * rather than written as nonsense.
     */
    @JavascriptInterface
    public void mark(String name, double markWallClockMs) {
        if (!"boot".equals(name) && !"shell".equals(name) && !"content".equals(name)) return;
        if (!Double.isFinite(markWallClockMs) || markWallClockMs <= 0) return;
        long elapsed = Math.round(markWallClockMs) - forkWallClockMs;
        if (elapsed < 0 || elapsed > 600_000) return;
        Log.d(MainActivity.LAUNCH_TAG, name + " mark at " + elapsed + "ms");
    }
}
