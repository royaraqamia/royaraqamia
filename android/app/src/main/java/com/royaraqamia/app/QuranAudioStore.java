package com.royaraqamia.app;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * The recitation's kept copies, in the app's own storage.
 *
 * The same shape the web keeps in OPFS (ADR-0081): a content-addressed key
 * `<edition>/<surah>/<ayah>@<sha256>.mp3`, a 128 MiB budget evicted least
 * recently used first, and a sha256 check before a byte enters the index. The
 * difference is who does the work: this copy is written by the shell, so it
 * keeps downloading while the WebView is frozen, and the native player reads it
 * without a `blob:` URL.
 *
 * There is no `__` in the directory name, so the Local Store listing that parses
 * `<product>__<identity>` cannot mistake it for an account-scoped copy.
 */
final class QuranAudioStore {

    static final long BUDGET_BYTES = 128L * 1024 * 1024;
    private static final String INDEX_FILE = "index.json";

    private final File root;
    private final QuranHttp http;
    private final long budget;
    private final Object lock = new Object();
    private final List<Entry> entries = new ArrayList<>();

    QuranAudioStore(File root, QuranHttp http) {
        this(root, http, BUDGET_BYTES);
    }

    QuranAudioStore(File root, QuranHttp http, long budget) {
        this.root = root;
        this.http = http;
        this.budget = budget;
        if (!root.exists()) root.mkdirs();
        load();
    }

    static final class Entry {

        final String key;
        final int surah;
        final int ayah;
        final long bytes;
        final String sha256;
        long storedAt;
        long lastUsedAt;

        Entry(
            String key,
            int surah,
            int ayah,
            long bytes,
            String sha256,
            long storedAt,
            long lastUsedAt
        ) {
            this.key = key;
            this.surah = surah;
            this.ayah = ayah;
            this.bytes = bytes;
            this.sha256 = sha256;
            this.storedAt = storedAt;
            this.lastUsedAt = lastUsedAt;
        }
    }

    static final class KeepResult {

        final int stored;
        final int reused;
        final int evicted;

        KeepResult(int stored, int reused, int evicted) {
            this.stored = stored;
            this.reused = reused;
            this.evicted = evicted;
        }
    }

    interface Progress {
        void onProgress(int done, int total);
    }

    /** `none`, `partial` or `complete`, exactly as the web names them. */
    String savedState(int surah, int ayahCount) {
        synchronized (lock) {
            int held = 0;
            for (Entry entry : entries) {
                if (entry.surah == surah && fileFor(entry).isFile()) held += 1;
            }
            if (held == 0 || ayahCount <= 0) return "none";
            return held >= ayahCount ? "complete" : "partial";
        }
    }

    /** The kept file for an Ayah, or null when this device does not hold it. */
    File fileFor(int surah, QuranManifest.AyahFile file) {
        synchronized (lock) {
            Entry entry = find(QuranManifest.audioKey(surah, file));
            if (entry == null) return null;
            File stored = fileFor(entry);
            return stored.isFile() && stored.length() == file.bytes ? stored : null;
        }
    }

    /** Reading an Ayah is a use in the LRU. */
    void touch(int surah, QuranManifest.AyahFile file) {
        synchronized (lock) {
            Entry entry = find(QuranManifest.audioKey(surah, file));
            if (entry == null) return;
            entry.lastUsedAt = System.currentTimeMillis();
            save();
        }
    }

    KeepResult keep(
        QuranManifest manifest,
        String baseUrl,
        Progress progress
    ) throws IOException {
        int total = manifest.files.size();
        int stored = 0;
        int reused = 0;
        Set<String> keepKeys = new HashSet<>();

        for (int index = 0; index < total; index += 1) {
            QuranManifest.AyahFile file = manifest.files.get(index);
            String key = QuranManifest.audioKey(manifest.surah, file);
            keepKeys.add(key);

            File target = fileFor(key);
            boolean held;
            synchronized (lock) {
                Entry entry = find(key);
                held = entry != null && target.isFile() && target.length() == file.bytes;
            }

            if (held) {
                reused += 1;
                progress.onProgress(index + 1, total);
                continue;
            }

            byte[] bytes = http.get(manifest.remoteUrl(baseUrl, file));
            if (bytes.length != file.bytes) {
                throw new IOException(
                    "Ayah " + file.ayah + " is " + bytes.length + " bytes, not " + file.bytes
                );
            }
            if (!sha256(bytes).equals(file.sha256)) {
                throw new IOException("Ayah " + file.ayah + " does not match the manifest's sha256");
            }

            File parent = target.getParentFile();
            if (parent != null && !parent.exists()) parent.mkdirs();
            File part = new File(parent, target.getName() + ".part");
            try (FileOutputStream out = new FileOutputStream(part)) {
                out.write(bytes);
            } catch (IOException failure) {
                part.delete();
                throw failure;
            }
            if (!part.renameTo(target)) {
                part.delete();
                throw new IOException("could not store " + key);
            }

            long now = System.currentTimeMillis();
            synchronized (lock) {
                Entry existing = find(key);
                if (existing == null) {
                    entries.add(
                        new Entry(key, manifest.surah, file.ayah, file.bytes, file.sha256, now, now)
                    );
                } else {
                    existing.lastUsedAt = now;
                }
                save();
            }
            stored += 1;
            progress.onProgress(index + 1, total);
        }

        int evicted = enforceBudget(keepKeys);
        return new KeepResult(stored, reused, evicted);
    }

    private int enforceBudget(Set<String> keep) {
        synchronized (lock) {
            long usage = 0;
            for (Entry entry : entries) usage += entry.bytes;
            if (usage <= budget) return 0;

            List<Entry> candidates = new ArrayList<>(entries);
            candidates.sort(Comparator.comparingLong(entry -> entry.lastUsedAt));

            int evicted = 0;
            for (Entry candidate : candidates) {
                if (usage <= budget) break;
                if (keep.contains(candidate.key)) continue;
                File file = fileFor(candidate);
                if (file.exists() && !file.delete()) continue;
                entries.remove(candidate);
                usage -= candidate.bytes;
                evicted += 1;
            }
            if (evicted > 0) save();
            return evicted;
        }
    }

    private Entry find(String key) {
        for (Entry entry : entries) {
            if (entry.key.equals(key)) return entry;
        }
        return null;
    }

    private File fileFor(String key) {
        return new File(root, key);
    }

    private File fileFor(Entry entry) {
        return fileFor(entry.key);
    }

    private void load() {
        File index = new File(root, INDEX_FILE);
        if (!index.isFile()) return;
        try {
            JSONArray array = new JSONArray(QuranFiles.readUtf8(index));
            for (int i = 0; i < array.length(); i += 1) {
                JSONObject row = array.getJSONObject(i);
                Entry entry = new Entry(
                    row.getString("key"),
                    row.getInt("surah"),
                    row.getInt("ayah"),
                    row.getLong("bytes"),
                    row.getString("sha256"),
                    row.getLong("storedAt"),
                    row.getLong("lastUsedAt")
                );
                // An index entry that promises bytes the device lacks is worse
                // than no entry: it would make an offline sura unplayable and
                // claim it was kept.
                if (fileFor(entry).isFile()) entries.add(entry);
            }
        } catch (IOException | JSONException ignored) {
            // A corrupt index is an empty store; the files become orphans and
            // the next keep rewrites what it needs.
        }
    }

    private void save() {
        JSONArray array = new JSONArray();
        try {
            for (Entry entry : entries) {
                JSONObject row = new JSONObject();
                row.put("key", entry.key);
                row.put("surah", entry.surah);
                row.put("ayah", entry.ayah);
                row.put("bytes", entry.bytes);
                row.put("sha256", entry.sha256);
                row.put("storedAt", entry.storedAt);
                row.put("lastUsedAt", entry.lastUsedAt);
                array.put(row);
            }
            File index = new File(root, INDEX_FILE);
            File part = new File(root, INDEX_FILE + ".part");
            try (FileOutputStream out = new FileOutputStream(part)) {
                out.write(array.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
            }
            if (!part.renameTo(index)) part.delete();
        } catch (IOException | JSONException ignored) {
            // Bookkeeping only: the bytes are what the reader hears next.
        }
    }

    private static String sha256(byte[] bytes) throws IOException {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hashed = digest.digest(bytes);
            StringBuilder hex = new StringBuilder(hashed.length * 2);
            for (byte value : hashed) hex.append(String.format(Locale.ROOT, "%02x", value));
            return hex.toString();
        } catch (NoSuchAlgorithmException failure) {
            throw new IOException("SHA-256 is not available", failure);
        }
    }
}
