package com.royaraqamia.app;

import android.content.Context;

import org.json.JSONException;
import org.json.JSONObject;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.MalformedURLException;
import java.net.URL;
import java.nio.charset.StandardCharsets;

/**
 * The origin the shell loads, and the paths of the shell's own documents on it.
 *
 * The shell is configured with one remote URL (`capacitor.config.ts`), written
 * into the APK's assets as `capacitor.config.json` by `cap sync`. Two native
 * features need the same origin without a bridge to ask: the update check
 * (ADR-0043) reads `latest.json` from it, and the background drain (ADR-0059)
 * loads `/sync-flush.html` from it while no activity exists at all.
 *
 * Everything here is pure except {@link #origin(Context)}, which reads the asset:
 * the URL arithmetic is the part worth pinning on the JVM, because both features
 * inherit whatever it gets wrong.
 */
final class ShellServer {

    /** Written by `cap sync`; the only place the shell states its own origin. */
    static final String CONFIG_ASSET = "capacitor.config.json";
    /** The background drain's page (ADR-0059), served from `public/`. */
    static final String FLUSH_PATH = "/sync-flush.html";

    private ShellServer() {}

    /**
     * `scheme://host[:port]` for a configured server URL, with the path, query and
     * fragment dropped. Returns null for anything that is not a URL, so a caller
     * reports it rather than guessing an origin.
     */
    static String originOf(String serverUrl) {
        if (serverUrl == null || serverUrl.isEmpty()) return null;
        try {
            URL url = new URL(serverUrl);
            int port = url.getPort();
            return url.getProtocol() + "://" + url.getHost() + (port == -1 ? "" : ":" + port);
        } catch (MalformedURLException e) {
            return null;
        }
    }

    /** An absolute URL on the configured origin, e.g. `/sync-flush.html`. */
    static String pageUrl(String serverUrl, String path) {
        String origin = originOf(serverUrl);
        return origin == null ? null : origin + path;
    }

    /**
     * The `server.url` from the Capacitor config `cap sync` writes, or null when
     * this build has no config to read. A byte-order mark is stripped rather than
     * rejected: one arrives easily from an editor on Windows, and failing on it
     * would take the drain down silently on exactly one machine's build.
     */
    static String originFrom(String configJson) throws JSONException {
        JSONObject config = new JSONObject(configJson.replace("\uFEFF", ""));
        JSONObject server = config.optJSONObject("server");
        return server == null ? null : originOf(server.optString("url", ""));
    }

    /**
     * The origin this build loads, read from the packaged config. Null when the
     * asset is missing or unreadable, which is a build that cannot reach its own
     * site at all — the caller logs it rather than inventing an origin.
     */
    static String origin(Context context) {
        try (InputStream stream = context.getAssets().open(CONFIG_ASSET)) {
            return originFrom(read(stream));
        } catch (IOException | JSONException e) {
            return null;
        }
    }

    private static String read(InputStream stream) throws IOException {
        StringBuilder text = new StringBuilder();
        try (BufferedReader reader = new BufferedReader(
                new InputStreamReader(stream, StandardCharsets.UTF_8))) {
            char[] buffer = new char[4096];
            int read;
            while ((read = reader.read(buffer)) != -1) {
                text.append(buffer, 0, read);
            }
        }
        return text.toString();
    }
}
