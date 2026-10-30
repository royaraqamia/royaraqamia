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
import java.util.Locale;

/**
 * The shell's side of update handling (ADR-0043).
 *
 * The shell is a remote-URL app (ADR-0036), so its web half updates the way the
 * site does, while the installed APK never moves on its own. What the shell can
 * know is whether a newer APK exists: this reads `public/android/latest.json`
 * from the same origin the shell loads, compares its `versionCode` with the
 * installed one, and hands the answer to {@link ShellUpdatePrompt}, which asks
 * the user and — since ADR-0044 — installs it.
 *
 * Everything here is deliberately pure and blocking-free at the edges — parsing,
 * the URL it fetches, the comparison, and which URLs may be trusted — so it can
 * be tested on the JVM (`ShellUpdateTest`) without a device, a manifest server, or
 * a WebView. Only {@link #check} touches the network, and its caller does that off
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
        /** What the published APK must hash to, and how big it is. */
        final String sha256;
        final long sizeBytes;
        final String notes;
        /** Percentage of devices this release is offered to; 100 means everyone. */
        final int rollout;
        /** Whether this device is inside the staged rollout for this release. */
        final boolean rolloutEligible;

        Status(
                int installedCode,
                int latestCode,
                int minSupportedCode,
                String versionName,
                String apkUrl,
                String sha256,
                long sizeBytes,
                String notes,
                int rollout,
                boolean rolloutEligible) {
            this.installedCode = installedCode;
            this.latestCode = latestCode;
            this.minSupportedCode = minSupportedCode;
            this.versionName = versionName;
            this.apkUrl = apkUrl;
            this.sha256 = sha256;
            this.sizeBytes = sizeBytes;
            this.notes = notes;
            this.rollout = rollout;
            this.rolloutEligible = rolloutEligible;
        }

        /**
         * A newer APK is published than the one installed, and this device is in
         * the release's rollout cohort. A floor is absolute and does not wait for
         * a percentage: {@link #unsupported()} is the reason it cannot be declined.
         */
        boolean updatePending() {
            return latestCode > installedCode && rolloutEligible;
        }

        /** The installed shell is too old for the current site (nothing to decline). */
        boolean unsupported() {
            return minSupportedCode > installedCode;
        }

        /**
         * The same release, with the server's floor merged in. A `426` may arrive
         * before the manifest names the new floor; the app still has to show the
         * blocking card rather than a dismissable offer.
         */
        Status withMinimumSupportedCode(int floor) {
            int merged = Math.max(minSupportedCode, floor);
            return new Status(
                    installedCode,
                    latestCode,
                    merged,
                    versionName,
                    apkUrl,
                    sha256,
                    sizeBytes,
                    notes,
                    rollout,
                    rolloutEligible);
        }
    }

    static Status idle(int installedCode) {
        return new Status(installedCode, installedCode, 0, "", "", "", 0, "", 100, true);
    }

    /**
     * The manifest URL for the origin the shell was configured with. Returns null
     * when the configured URL is not a URL at all, which the caller reports
     * rather than guessing an origin.
     *
     * The arithmetic lives in `ShellServer`, beside the drain page that needs the
     * same origin: two spellings of "our origin" would be two chances to disagree
     * about which site this shell talks to.
     */
    static String manifestUrl(String serverUrl) {
        return ShellServer.pageUrl(serverUrl, MANIFEST_PATH);
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
        return parse(json, installedCode, "");
    }

    /**
     * Reads a manifest and decides this device's place in an optional staged
     * rollout. `deviceSeed` is stable across app updates (the Android ID), so the
     * same device gets the same answer for the same release, while a later release
     * is a fresh cohort.
     */
    static Status parse(String json, int installedCode, String deviceSeed) throws JSONException {
        JSONObject manifest = new JSONObject(json.replace("\uFEFF", ""));
        int latestCode = manifest.optInt("versionCode", 0);
        int rollout = rolloutOf(manifest);
        return new Status(
            installedCode,
            latestCode,
            manifest.optInt("minSupportedVersionCode", 0),
            manifest.optString("versionName", ""),
            manifest.optString("apkUrl", ""),
            manifest.optString("sha256", ""),
            manifest.optLong("sizeBytes", 0),
            manifest.optString("notes", ""),
            rollout,
            isRolledOut(deviceSeed, latestCode, rollout)
        );
    }

    /**
     * A manifest without `rollout` is a full release; anything outside 0–100 is
     * not a percentage, and the safe reading of a broken field is "everyone".
     */
    private static int rolloutOf(JSONObject manifest) {
        if (!manifest.has("rollout")) return 100;
        Object raw = manifest.opt("rollout");
        if (!(raw instanceof Number)) return 100;
        int value = ((Number) raw).intValue();
        if (value < 0) return 0;
        if (value > 100) return 100;
        return value;
    }

    /**
     * Where a device sits in a release's rollout, 0–99. Deterministic across the
     * JVM and Android because it is plain integer arithmetic (FNV-1a) over the
     * device seed and the release counter — no clock, no random source, and a new
     * release reshuffles the cohort.
     */
    static int rolloutBucket(String deviceSeed, int versionCode) {
        String key = (deviceSeed == null ? "" : deviceSeed) + ":" + versionCode;
        long hash = 0x811c9dc5L;
        for (int index = 0; index < key.length(); index++) {
            hash ^= key.charAt(index);
            hash = (hash * 0x01000193L) & 0xffffffffL;
        }
        return (int) (hash % 100L);
    }

    /** Whether a release at this percentage includes this device. */
    static boolean isRolledOut(String deviceSeed, int versionCode, int rollout) {
        if (rollout >= 100) return true;
        if (rollout <= 0) return false;
        return rolloutBucket(deviceSeed, versionCode) < rollout;
    }

    /**
     * Whether an update URL may be fetched and handed to the installer. The
     * manifest is ours and served from our own origin, but it is also a document
     * that arrives over the network: a URL that says `file://` or `intent://` is
     * how one would try to make the shell install something already on the device,
     * so only the two schemes that mean "a download" are allowed.
     *
     * Plain http is allowed only for the addresses a development server runs on,
     * and only in a debug build. The emulator reaches its host on 10.0.2.2, so
     * without that exception the install path could not be exercised on a device
     * before publishing to GitHub — and the drill is what has caught every real
     * defect in this feature so far. Measured: the packaged debug APK carries
     * `android:usesCleartextTraffic=true`, the release APK carries no such
     * attribute, and this check refuses http in a release build in any case. A
     * release build never allows it.
     */
    static boolean isAllowedUpdateUrl(String url, boolean debug) {
        if (url == null || url.isEmpty()) return false;
        try {
            URL parsed = new URL(url);
            String scheme = parsed.getProtocol();
            if ("https".equals(scheme)) return true;
            return debug && "http".equals(scheme) && isDevelopmentHost(parsed.getHost());
        } catch (MalformedURLException e) {
            return false;
        }
    }

    private static boolean isDevelopmentHost(String host) {
        if (host == null) return false;
        return "10.0.2.2".equals(host)
                || "localhost".equals(host)
                || "127.0.0.1".equals(host)
                || "::1".equals(host);
    }

    /** Fetches the manifest and compares it with the installed shell. */
    static Status check(String manifestUrl, int installedCode) throws IOException, JSONException {
        return check(manifestUrl, installedCode, "");
    }

    /** Fetches the manifest and places this device in its optional rollout. */
    static Status check(String manifestUrl, int installedCode, String deviceSeed)
            throws IOException, JSONException {
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

            return parse(readFully(connection.getInputStream()), installedCode, deviceSeed);
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    /**
     * A byte count as the dialogs print it (ADR-0054): mebibytes to one decimal
     * place, always with a `.` and Western digits — and a tenth that is always
     * zero is dropped.
     *
     * Pure, and tested, because it is the one part of the dialog's copy that is
     * arithmetic rather than a string resource. `Locale.ROOT` rather than the
     * device locale: an Arabic device would otherwise render `7,1`, and the
     * size reads beside a version number that is already Latin.
     *
     * Binary megabytes, which is what Android's own file sizes use — the
     * published APK is 7,449,653 bytes and this says «7.1», not «7.4». A whole
     * number of them says «30» rather than «30.0»: a tenth that is always zero
     * is noise in a sentence about how big a download is, and a size that never
     * carries one is the exception, not the rule.
     */
    static String formatSize(long bytes) {
        String mebibytes = String.format(Locale.ROOT, "%.1f", Math.max(0L, bytes) / 1024.0 / 1024.0);
        return mebibytes.endsWith(".0")
                ? mebibytes.substring(0, mebibytes.length() - 2)
                : mebibytes;
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
