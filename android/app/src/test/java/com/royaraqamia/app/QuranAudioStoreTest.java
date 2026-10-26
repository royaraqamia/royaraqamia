package com.royaraqamia.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;
import org.junit.Rule;
import org.junit.Test;
import org.junit.rules.TemporaryFolder;

/**
 * The native store and manifest reader, on the JVM: what a keystore-less build
 * can prove without a device. The queue and the notification are media3's, and
 * are checked by the shell's own on-device pass.
 */
public class QuranAudioStoreTest {

    @Rule
    public TemporaryFolder temporary = new TemporaryFolder();

    private static final class FakeHttp implements QuranHttp {

        final Map<String, byte[]> responses = new HashMap<>();
        final Map<String, Integer> calls = new HashMap<>();
        boolean offline;

        @Override
        public byte[] get(String url) throws IOException {
            calls.merge(url, 1, Integer::sum);
            if (offline) throw new IOException("offline");
            byte[] bytes = responses.get(url);
            if (bytes == null) throw new IOException("no response for " + url);
            return bytes;
        }
    }

    @Test
    public void parsesTheCommittedManifestShape() throws Exception {
        String json = manifestJson(1, "الفاتحة", new String[] { "one", "two" });
        QuranManifest manifest = QuranManifest.parse(1, json);

        assertEquals(1, manifest.surah);
        assertEquals("الفاتحة", manifest.name);
        assertEquals(2, manifest.files.size());
        assertEquals(1, manifest.files.get(0).ayah);
        assertEquals("ar.alafasy/001/001.mp3", manifest.files.get(0).key);
        assertEquals(64, manifest.files.get(0).sha256.length());
    }

    @Test
    public void refusesAManifestItCannotTrust() throws Exception {
        try {
            QuranManifest.parse(2, manifestJson(1, "الفاتحة", new String[] { "one" }));
            fail("a manifest for another sura was accepted");
        } catch (JSONException expected) {
            // The sura number is the identity of the queue.
        }

        String empty = new JSONObject()
            .put("surah", 1)
            .put("name", "الفاتحة")
            .put("files", new JSONArray())
            .toString();
        try {
            QuranManifest.parse(1, empty);
            fail("an empty manifest was accepted");
        } catch (JSONException expected) {
            // There would be nothing to play.
        }
    }

    @Test
    public void keepsEveryAyahAndReusesWhatIsAlreadyThere() throws Exception {
        FakeHttp http = new FakeHttp();
        QuranManifest manifest = manifest(1, "one", "two");
        serve(http, manifest, "https://audio.test", "one", "two");

        QuranAudioStore store = new QuranAudioStore(new File(temporary.getRoot(), "audio"), http);
        QuranAudioStore.KeepResult first = store.keep(
            manifest,
            "https://audio.test",
            (done, total) -> {}
        );

        assertEquals(2, first.stored);
        assertEquals(0, first.reused);
        assertEquals("complete", store.savedState(1, 2));
        assertTrue(store.fileFor(1, manifest.files.get(0)).isFile());

        QuranAudioStore.KeepResult second = store.keep(
            manifest,
            "https://audio.test",
            (done, total) -> {}
        );
        assertEquals(0, second.stored);
        assertEquals(2, second.reused);
        // Two fetches in total: the second keep read the bytes it already had.
        int fetches = http.calls.values().stream().mapToInt(Integer::intValue).sum();
        assertEquals(2, fetches);
    }

    @Test
    public void refusesBytesThatDoNotMatchTheManifest() throws Exception {
        FakeHttp http = new FakeHttp();
        QuranManifest manifest = manifest(1, "one");
        http.responses.put(
            manifest.remoteUrl("https://audio.test", manifest.files.get(0)),
            "bad".getBytes(StandardCharsets.UTF_8)
        );

        QuranAudioStore store = new QuranAudioStore(new File(temporary.getRoot(), "audio"), http);
        try {
            store.keep(manifest, "https://audio.test", (done, total) -> {});
            fail("a substituted file was stored");
        } catch (IOException expected) {
            // The hash is the gate.
        }
        assertEquals("none", store.savedState(1, 1));
        assertNull(store.fileFor(1, manifest.files.get(0)));
    }

    @Test
    public void keepsTheNewSuraAndEvictsTheOldestUse() throws Exception {
        FakeHttp http = new FakeHttp();
        QuranManifest first = manifest(1, "aaaaaaaaaa");
        QuranManifest second = manifest(2, "bbbbbbbbbb");
        serve(http, first, "https://audio.test", "aaaaaaaaaa");
        serve(http, second, "https://audio.test", "bbbbbbbbbb");

        // Two ten-byte files, a budget that holds one of them.
        QuranAudioStore store = new QuranAudioStore(
            new File(temporary.getRoot(), "audio"),
            http,
            15
        );

        store.keep(first, "https://audio.test", (done, total) -> {});
        store.keep(second, "https://audio.test", (done, total) -> {});

        assertEquals("none", store.savedState(1, 1));
        assertEquals("complete", store.savedState(2, 1));
        assertNull(store.fileFor(1, first.files.get(0)));
        assertNotNull(store.fileFor(2, second.files.get(0)));
    }

    @Test
    public void readsTheCatalogAndServesAKeptManifestOffline() throws Exception {
        FakeHttp http = new FakeHttp();
        String origin = "https://site.test";
        String manifest = manifestJson(1, "الفاتحة", new String[] { "one" });
        http.responses.put(
            origin + "/quran/audio/ar.alafasy/index.json",
            catalogJson("https://audio.test", "مشاري راشد العفاسي").getBytes(StandardCharsets.UTF_8)
        );
        http.responses.put(origin + "/quran/audio/ar.alafasy/001.json", manifest.getBytes(StandardCharsets.UTF_8));

        QuranManifestRepository repository = new QuranManifestRepository(
            new File(temporary.getRoot(), "manifests"),
            http
        );

        QuranManifest loaded = repository.load(origin, 1);
        assertEquals("الفاتحة", loaded.name);
        assertEquals("https://audio.test", repository.baseUrl());
        assertEquals("مشاري راشد العفاسي", repository.reciter());

        http.offline = true;
        QuranManifest offline = repository.load(origin, 1);
        assertEquals("الفاتحة", offline.name);
        assertEquals(1, offline.files.size());
    }

    private QuranManifest manifest(int surah, String... contents) throws Exception {
        return QuranManifest.parse(surah, manifestJson(surah, "سورة " + surah, contents));
    }

    private static void serve(
        FakeHttp http,
        QuranManifest manifest,
        String baseUrl,
        String... contents
    ) {
        for (int index = 0; index < contents.length; index += 1) {
            http.responses.put(
                manifest.remoteUrl(baseUrl, manifest.files.get(index)),
                contents[index].getBytes(StandardCharsets.UTF_8)
            );
        }
    }

    private static String manifestJson(int surah, String name, String[] contents)
        throws JSONException {
        JSONArray files = new JSONArray();
        long bytes = 0;
        for (int index = 0; index < contents.length; index += 1) {
            byte[] data = contents[index].getBytes(StandardCharsets.UTF_8);
            bytes += data.length;
            files.put(
                new JSONObject()
                    .put("ayah", index + 1)
                    .put(
                        "key",
                        String.format(
                            Locale.ROOT,
                            "ar.alafasy/%03d/%03d.mp3",
                            surah,
                            index + 1
                        )
                    )
                    .put("bytes", data.length)
                    .put("sha256", sha256(data))
            );
        }
        return new JSONObject()
            .put("edition", "ar.alafasy")
            .put("surah", surah)
            .put("name", name)
            .put("ayahCount", contents.length)
            .put("bytes", bytes)
            .put("files", files)
            .toString();
    }

    private static String catalogJson(String baseUrl, String reciter) throws JSONException {
        JSONArray editions = new JSONArray().put(
            new JSONObject().put("id", "ar.alafasy").put("baseUrl", baseUrl).put("reciter", reciter)
        );
        return new JSONObject().put("editions", editions).toString();
    }

    private static String sha256(byte[] bytes) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            StringBuilder hex = new StringBuilder();
            for (byte value : digest.digest(bytes)) {
                hex.append(String.format(Locale.ROOT, "%02x", value));
            }
            return hex.toString();
        } catch (Exception failure) {
            throw new IllegalStateException(failure);
        }
    }
}
