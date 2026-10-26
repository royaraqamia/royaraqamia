package com.royaraqamia.app;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.util.Locale;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The manifest reader: the site's own committed JSON, fetched from the origin
 * the WebView is loaded from and cached on the device so a kept sura can be
 * started in airplane mode.
 *
 * Native rather than the page's, because the queue has to advance into the next
 * sura while the screen is off — the one time the WebView's JavaScript is not
 * running. The origin is passed in by the page so a device pointed at a local
 * dev server reads that server's manifests rather than production's.
 */
final class QuranManifestRepository {

    private static final String CATALOG_FILE = "catalog.json";

    private final File cacheDir;
    private final QuranHttp http;

    private String baseUrl = "";
    private String reciter = QuranManifest.DEFAULT_RECITER;

    QuranManifestRepository(File cacheDir, QuranHttp http) {
        this.cacheDir = cacheDir;
        this.http = http;
        if (!cacheDir.exists()) cacheDir.mkdirs();
    }

    QuranManifest load(String requestedOrigin, int surah) throws IOException, JSONException {
        if (surah < 1 || surah > QuranManifest.LAST_SURAH) {
            throw new IOException("no sura " + surah);
        }

        ensureCatalog(requestedOrigin);

        File cached = new File(cacheDir, String.format(Locale.ROOT, "%03d.json", surah));
        try {
            byte[] bytes = http.get(surahUrl(requestedOrigin, surah));
            writeAtomically(cached, bytes);
            return QuranManifest.parse(surah, new String(bytes, StandardCharsets.UTF_8));
        } catch (IOException failure) {
            if (!cached.isFile()) throw failure;
            // Offline, a kept sura's manifest is the one the device already has.
            return QuranManifest.parse(surah, read(cached));
        }
    }

    String baseUrl() {
        return baseUrl == null || baseUrl.isEmpty() ? QuranManifest.DEFAULT_BASE_URL : baseUrl;
    }

    String reciter() {
        return reciter;
    }

    private void ensureCatalog(String requestedOrigin) {
        String clean = normalizeOrigin(requestedOrigin);
        if (clean == null) return;

        File cached = new File(cacheDir, CATALOG_FILE);
        if (cached.isFile()) {
            readCatalog(read(cached));
            if (!baseUrl.isEmpty()) return;
        }

        try {
            String json = new String(
                http.get(clean + "/quran/audio/" + QuranManifest.EDITION + "/index.json"),
                StandardCharsets.UTF_8
            );
            readCatalog(json);
            writeAtomically(cached, json.getBytes(StandardCharsets.UTF_8));
        } catch (IOException ignored) {
            // The defaults are the published edition; a failed index only costs
            // the reciter's name and the host's address, not playback of a kept
            // sura (the manifest's keys are relative to the same host).
        }
    }

    private void readCatalog(String json) {
        try {
            JSONObject root = new JSONObject(json);
            JSONObject edition = root.getJSONArray("editions").getJSONObject(0);
            String host = edition.getString("baseUrl");
            String name = edition.getString("reciter");
            if (normalizeOrigin(host) == null) return;
            baseUrl = host;
            reciter = name;
        } catch (JSONException ignored) {
            // A corrupt cache is a cache to fetch past, not a reason to stop.
        }
    }

    private static String normalizeOrigin(String value) {
        if (value == null) return null;
        try {
            URI uri = URI.create(value);
            String scheme = uri.getScheme();
            if (scheme == null) return null;
            String lower = scheme.toLowerCase(Locale.ROOT);
            if (!lower.equals("http") && !lower.equals("https")) return null;
            if (uri.getHost() == null || uri.getHost().isEmpty()) return null;
            if (uri.getUserInfo() != null) return null;
            return lower + "://" + uri.getHost() + (uri.getPort() > 0 ? ":" + uri.getPort() : "");
        } catch (IllegalArgumentException ignored) {
            return null;
        }
    }

    private static String surahUrl(String origin, int surah) {
        return (
            origin +
            "/quran/audio/" +
            QuranManifest.EDITION +
            "/" +
            String.format(Locale.ROOT, "%03d.json", surah)
        );
    }

    private static String read(File file) {
        try {
            return QuranFiles.readUtf8(file);
        } catch (IOException ignored) {
            return "";
        }
    }

    private static void writeAtomically(File file, byte[] bytes) {
        File parent = file.getParentFile();
        if (parent != null && !parent.exists()) parent.mkdirs();
        File temporary = new File(file.getParentFile(), file.getName() + ".part");
        try (FileOutputStream out = new FileOutputStream(temporary)) {
            out.write(bytes);
        } catch (IOException ignored) {
            return;
        }
        if (!temporary.renameTo(file)) {
            // A failed rename leaves the old cache intact, which is what the
            // offline path reads; the download itself is not a failure.
            temporary.delete();
        }
    }
}
