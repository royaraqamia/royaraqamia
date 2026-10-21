package com.royaraqamia.app;

import org.json.JSONObject;

/**
 * What the drain page reported, and what the worker should do about it
 * (ADR-0059).
 *
 * The page (`public/sync-flush.html`, built from `frontend/api/sync-flush.ts`)
 * answers `{"pending": n, "failed": n, "error": "…"}`. The worker's only decision
 * is whether to come back, and the default has to be "yes": a report that never
 * arrived, a body that cannot be parsed, or a lookup that failed all mean the
 * queue was never replayed, whereas treating them as "nothing to do" would
 * silently retire work the user is waiting on.
 *
 * Pure, so the JVM tests (`SyncFlushResultTest`) pin the decision without a
 * device, a WebView or a network.
 */
final class SyncFlushResult {

    /** Whether the worker should come back for the work that is left. */
    final boolean retry;
    /** One line for the log, and for whoever is reading `adb logcat`. */
    final String summary;

    private SyncFlushResult(boolean retry, String summary) {
        this.retry = retry;
        this.summary = summary;
    }

    /** The page said everything it owed was delivered. */
    static SyncFlushResult done(int failed) {
        return new SyncFlushResult(false, "drained (failed=" + failed + ")");
    }

    /** There is work to come back for, with the reason stated. */
    static SyncFlushResult again(String summary) {
        return new SyncFlushResult(true, summary);
    }

    /**
     * Reads the page's report. Anything unreadable is "come back", never "done":
     * the one thing this must not do is retire a queue it never saw.
     */
    static SyncFlushResult parse(String json) {
        if (json == null || json.trim().isEmpty()) return again("the page reported nothing");

        int pending;
        int failed;
        String error;
        try {
            JSONObject report = new JSONObject(json);
            pending = report.optInt("pending", -1);
            failed = report.optInt("failed", 0);
            // Not `optString`: Android stringifies a JSON `null` into "null", so a
            // clean report — the page's own shape, `"error": null` — read as a
            // failed drain, and the worker retried a queue that was already empty
            // (#484, found on a device). A JSON null is an absent error.
            Object rawError = report.opt("error");
            error = rawError == null || rawError == JSONObject.NULL ? "" : String.valueOf(rawError);
        } catch (Exception e) {
            return again("the report could not be read: " + e.getMessage());
        }

        // A report with no `pending` is not this page's report at all.
        if (pending < 0) return again("the report carried no pending count");
        if (!error.isEmpty()) return again("the drain failed: " + error);
        if (pending > 0) return again(pending + " intent(s) still queued");

        return done(failed);
    }
}
