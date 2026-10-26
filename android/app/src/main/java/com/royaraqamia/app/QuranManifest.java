package com.royaraqamia.app;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

/**
 * One sura's Recitation manifest, as `public/quran/audio/ar.alafasy/NNN.json`
 * publishes it (ADR-0062).
 *
 * The shell reads the same committed manifest the web does, so the bytes, the
 * hashes and the Ayah numbering cannot disagree between the two players. Only
 * the file list is here; the host and the reciter come from the edition index,
 * which {@link QuranManifestRepository} caches separately.
 */
final class QuranManifest {

    static final String EDITION = "ar.alafasy";
    static final String DEFAULT_BASE_URL = "https://audio.royaraqamia.com";
    static final String DEFAULT_RECITER = "مشاري راشد العفاسي";
    static final int LAST_SURAH = 114;

    private static final Pattern SHA256 = Pattern.compile("^[0-9a-f]{64}$");

    final int surah;
    final String name;
    final List<AyahFile> files;

    private QuranManifest(int surah, String name, List<AyahFile> files) {
        this.surah = surah;
        this.name = name;
        this.files = files;
    }

    static final class AyahFile {

        final int ayah;
        final String key;
        final long bytes;
        final String sha256;

        AyahFile(int ayah, String key, long bytes, String sha256) {
            this.ayah = ayah;
            this.key = key;
            this.bytes = bytes;
            this.sha256 = sha256;
        }
    }

    static QuranManifest parse(int expectedSurah, String json) throws JSONException {
        JSONObject root = new JSONObject(json);
        int surah = root.getInt("surah");
        if (surah != expectedSurah) {
            throw new JSONException("manifest for sura " + surah + ", asked for " + expectedSurah);
        }

        String name = root.getString("name").trim();
        if (name.isEmpty()) throw new JSONException("manifest has no sura name");

        JSONArray array = root.getJSONArray("files");
        if (array.length() == 0) throw new JSONException("manifest has no Ayat");

        List<AyahFile> files = new ArrayList<>(array.length());
        for (int index = 0; index < array.length(); index += 1) {
            JSONObject entry = array.getJSONObject(index);
            int ayah = entry.getInt("ayah");
            if (ayah != index + 1) {
                throw new JSONException("Ayah " + ayah + " is out of order at " + (index + 1));
            }

            String key = entry.getString("key");
            if (key.contains("..") || key.contains("\\") || !key.startsWith(EDITION + "/")) {
                throw new JSONException("refusing a key outside the edition: " + key);
            }

            String sha256 = entry.getString("sha256");
            if (!SHA256.matcher(sha256).matches()) {
                throw new JSONException("Ayah " + ayah + " has no sha256");
            }

            long bytes = entry.getLong("bytes");
            if (bytes <= 0) throw new JSONException("Ayah " + ayah + " has no size");

            files.add(new AyahFile(ayah, key, bytes, sha256));
        }

        return new QuranManifest(surah, name, files);
    }

    String baseUrl(String base) {
        return base == null || base.isEmpty() ? DEFAULT_BASE_URL : base;
    }

    static String audioKey(int surah, AyahFile file) {
        return String.format(
            Locale.ROOT,
            "%s/%03d/%03d@%s.mp3",
            EDITION,
            surah,
            file.ayah,
            file.sha256
        );
    }

    /** The URL the player streams when this Ayah is not on the device. */
    String remoteUrl(String base, AyahFile file) {
        return baseUrl(base) + "/" + file.key + "?v=" + file.sha256.substring(0, 8);
    }
}
