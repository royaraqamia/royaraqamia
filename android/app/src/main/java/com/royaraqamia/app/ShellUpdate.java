package com.royaraqamia.app;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.MalformedURLException;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * The shell's side of update handling (ADR-0043).
 *
 * The shell is a remote-URL app (ADR-0036), so its web half updates the way the
 * site does, while the installed APK never moves on its own. What the page can
 * be told is whether a newer APK exists: this reads `public/android/latest.json`
 * from the same origin the shell loads, compares its `versionCode` with the
 * installed one, and hands the answer to {@link ShellUpdaterPlugin}.
 *
 * Everything here is deliberately pure and blocking-free at the edges — parsing,
 * the URL it fetches, and the comparison take strings and numbers — so it can be
 * tested on the JVM (`ShellUpdateTest`) without a device, a manifest server, or a
 * WebView. Only {@link #check} touches the network, and its caller does that off
 * the main thread.
 */
final class ShellUpdate {

    /** Where the manifest lives, relative to the origin the shell loads. */
    static final String MANIFEST_PATH = "/android/latest.json";
    /** How the shell names itself in the WebView's user agent (ADR-0043). */
    static final String USER_AGENT_TOKEN = "RoyaraqamiaShell";
    private static final int TIMEOUT_MS = 10_000;

    private ShellUpdate() {}

    static final class Status {
        final int installedCode;
        final int latestCode;
        final int minSupportedCode;
        final String versionName;
        final String apkUrl;
        final String notes;

        Status(int installedCode, int latestCode, int minSupportedCode, String versionName, String apkUrl, String notes) {
            this.installedCode = installedCode;
            this.latestCode = latestCode;
            this.minSupportedCode = minSupportedCode;
            this.versionName = versionName;
            this.apkUrl = apkUrl;
            this.notes = notes;
        }

        /** A newer APK is published than the one installed. */
        boolean updatePending() {
            return latestCode > installedCode;
        }

        /** The installed shell is too old for the current site (nothing to decline). */
        boolean unsupported() {
            return minSupportedCode > installedCode;
        }

        JSONObject toJson() {
            JSONObject json = new JSONObject();
            try {
                json.put("installedCode", installedCode);
                json.put("latestCode", latestCode);
                json.put("minSupportedCode", minSupportedCode);
                json.put("versionName", versionName);
                json.put("apkUrl", apkUrl);
                json.put("notes", notes);
                json.put("updatePending", updatePending());
                json.put("unsupported", unsupported());
            } catch (JSONException e) {
                // JSONObject.put only throws for non-JSON values, and every value
                // here is a number or a String; nothing to do but report empty.
                return new JSONObject();
            }
            return json;
        }
    }

    static Status idle(int installedCode) {
        return new Status(installedCode, installedCode, 0, "", "", "");
    }

    /**
     * The manifest URL for the origin the shell was configured with. Returns null
     * when the configured URL is not a URL at all, which the caller reports
     * rather than guessing an origin.
     */
    static String manifestUrl(String serverUrl) {
        if (serverUrl == null || serverUrl.isEmpty()) return null;
        try {
            URL url = new URL(serverUrl);
            int port = url.getPort();
            return url.getProtocol() + "://" + url.getHost() + (port == -1 ? "" : ":" + port) + MANIFEST_PATH;
        } catch (MalformedURLException e) {
            return null;
        }
    }

    /**
     * Reads a manifest. Anything missing or of the wrong shape is treated as "no
     * update": a half-written manifest must not be able to talk a user into
     * installing an APK, and the only field whose absence is dangerous is
     * `apkUrl`, which the install action refuses to use when empty.
     *
     * A byte-order mark is stripped rather than rejected: one arrives easily from
     * an editor on Windows, and failing on it would take the whole channel down
     * silently — the manifest would look unreadable forever, on every device.
     */
    static Status parse(String json, int installedCode) throws JSONException {
        JSONObject manifest = new JSONObject(json.replace("\uFEFF", ""));
        return new Status(
            installedCode,
            manifest.optInt("versionCode", 0),
            manifest.optInt("minSupportedVersionCode", 0),
            manifest.optString("versionName", ""),
            manifest.optString("apkUrl", ""),
            manifest.optString("notes", "")
        );
    }

    /**
     * Whether `apkUrl` is something to hand to a browser. The manifest is ours
     * and served from our own origin, but a URL that says `file://` or
     * `intent://` is how a document would try to make the shell open something
     * local, so the two schemes that mean "a download over the network" are the
     * only ones allowed through.
     */
    static boolean isOpenableApkUrl(String apkUrl) {
        if (apkUrl == null || apkUrl.isEmpty()) return false;
        try {
            String scheme = new URL(apkUrl).getProtocol();
            return "https".equals(scheme) || "http".equals(scheme);
        } catch (MalformedURLException e) {
            return false;
        }
    }

    /** Fetches the manifest and compares it with the installed shell. */
    static Status check(String manifestUrl, int installedCode) throws IOException, JSONException {
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(manifestUrl).openConnection();
            connection.setConnectTimeout(TIMEOUT_MS);
            connection.setReadTimeout(TIMEOUT_MS);
            connection.setRequestMethod("GET");
            connection.setRequestProperty("Accept", "application/json");
            // The manifest is the one thing that must never come from a cache:
            // a stale copy would hold back an update or offer a withdrawn one.
            connection.setUseCaches(false);
            connection.setRequestProperty("Cache-Control", "no-cache");

            int code = connection.getResponseCode();
            if (code != HttpURLConnection.HTTP_OK) {
                throw new IOException("HTTP " + code + " from " + manifestUrl);
            }

            return parse(readFully(connection.getInputStream()), installedCode);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    private static String readFully(InputStream stream) throws IOException {
        StringBuilder body = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            String line;
            while ((line = reader.readLine()) != null) {
                body.append(line).append('\n');
            }
        }
        return body.toString();
    }
}
