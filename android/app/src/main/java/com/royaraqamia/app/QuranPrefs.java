package com.royaraqamia.app;

import android.content.Context;
import android.content.SharedPreferences;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The last position, in the shell's own preferences.
 *
 * The web keeps one too (ADR-0085), but the shell's is the authoritative one in
 * the app: playback can go on for hours with the WebView frozen, and only the
 * service knows where it actually is. A cold start reads this and shows the mini
 * player paused where the recitation was.
 */
final class QuranPrefs {

    private static final String FILE = "quran-player";

    private QuranPrefs() {}

    static void saveLast(
        Context context,
        int surah,
        String name,
        int ayah,
        int ayahCount,
        long offsetMs
    ) {
        SharedPreferences preferences = context.getSharedPreferences(FILE, Context.MODE_PRIVATE);
        preferences
            .edit()
            .putInt("surah", surah)
            .putString("name", name)
            .putInt("ayah", ayah)
            .putInt("ayahCount", ayahCount)
            .putLong("offsetMs", Math.max(offsetMs, 0))
            .apply();
    }

    static void clearLast(Context context) {
        context
            .getSharedPreferences(FILE, Context.MODE_PRIVATE)
            .edit()
            .remove("surah")
            .remove("name")
            .remove("ayah")
            .remove("ayahCount")
            .remove("offsetMs")
            .apply();
    }

    /** The stored position, or an empty object when the recitation was stopped. */
    static JSONObject last(Context context) {
        SharedPreferences preferences = context.getSharedPreferences(FILE, Context.MODE_PRIVATE);
        int surah = preferences.getInt("surah", 0);
        if (surah < 1 || surah > QuranManifest.LAST_SURAH) return new JSONObject();
        try {
            JSONObject state = new JSONObject();
            state.put("surah", surah);
            state.put("name", preferences.getString("name", ""));
            state.put("ayah", Math.max(preferences.getInt("ayah", 1), 1));
            state.put("ayahCount", Math.max(preferences.getInt("ayahCount", 0), 0));
            state.put("offset", preferences.getLong("offsetMs", 0) / 1000.0);
            return state;
        } catch (JSONException ignored) {
            return new JSONObject();
        }
    }
}
