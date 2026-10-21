package com.royaraqamia.app;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The shell's last reported drain, where `/device` can read it (#455).
 *
 * A drain's report ends the worker's wait and is dropped — so a user who opens
 * the app to already-current data cannot tell the work arrived while the app was
 * closed. This is the small record that survives: when the drain was, what it
 * delivered and pulled, what it left, and the error when there was one
 * (`System.currentTimeMillis` at save time is "when"; the report has no clock of
 * its own).
 *
 * Only a report the page actually sent becomes a record: a wake that never heard
 * from the drain page has no delivered/left counts to state, and inventing
 * zeroes would claim more than the shell knows. The parse stays pure so the JVM
 * tests (`SyncFlushRecordTest`) pin the surface the page parses without a
 * device; the persistence underneath is one {@link SharedPreferences} string.
 */
final class SyncFlushRecord {

    /** The preferences file {@link ShellBatteryPrompt} already owns for the shell. */
    static final String PREFS = "royaraqamia_shell";
    static final String KEY = "sync_flush_last";

    /** Epoch milliseconds of the moment the report landed. */
    final long at;
    /** Intents the server accepted during the drain. */
    final int delivered;
    /** Intents still queued when the drain ended. */
    final int left;
    /** Rows the pull read back from the server (ADR-0060). */
    final int pulled;
    /** Why the drain could not run, when it could not; null otherwise. */
    final String error;

    private SyncFlushRecord(long at, int delivered, int left, int pulled, String error) {
        this.at = at;
        this.delivered = delivered;
        this.left = left;
        this.pulled = pulled;
        this.error = error;
    }

    /**
     * Reads the drain page's report into a record, or null when the body is not
     * this page's report at all — the same test `SyncFlushResult.parse` makes
     * ("no `pending`" means the message is not a drain report, and whatever the
     * page landed on instead of the drain must not read as history).
     */
    static SyncFlushRecord fromReport(long at, String json) {
        if (json == null) return null;

        try {
            JSONObject report = new JSONObject(json);
            if (report.optInt("pending", -1) < 0) return null;

            return new SyncFlushRecord(
                at,
                sum(report.optJSONArray("outcomes"), "replayed"),
                report.getInt("pending"),
                sum(report.optJSONArray("refreshed"), "applied"),
                report.isNull("error") ? null : report.getString("error"));
        } catch (Exception e) {
            return null;
        }
    }

    private static int sum(JSONArray outcomes, String field) {
        if (outcomes == null) return 0;
        int total = 0;
        for (int at = 0; at < outcomes.length(); at++) {
            JSONObject outcome = outcomes.optJSONObject(at);
            if (outcome != null) total += outcome.optInt(field, 0);
        }
        return total;
    }

    /** The exact shape `readShellLastFlush` parses — keep the two pinned. */
    String toJson() {
        JSONObject json = new JSONObject();
        try {
            json.put("at", at);
            json.put("delivered", delivered);
            json.put("left", left);
            json.put("pulled", pulled);
            json.put("error", error == null ? JSONObject.NULL : error);
        } catch (Exception e) {
            return "";
        }
        return json.toString();
    }

    /** Persists the record over last write wins — the newest drain is the story. */
    static void save(Context context, SyncFlushRecord record) {
        context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit()
            .putString(KEY, record.toJson())
            .apply();
    }

    /** The stored JSON for the bridge's `lastFlush()`, or null when there is none. */
    static String load(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE).getString(KEY, null);
    }
}
