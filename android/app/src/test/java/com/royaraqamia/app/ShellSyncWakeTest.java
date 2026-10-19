package com.royaraqamia.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.Map;
import org.junit.Test;

/**
 * A wake, and the manifest that routes one here (ADR-0059, ADR-0060).
 *
 * Two things break silently. The first is the type string: the server sends it,
 * this build matches it, and nothing at runtime notices a rename — so
 * `scripts/__tests__/sync-flush-page.test.mjs` holds this constant to
 * `FCM_SYNC_WAKE` in the TypeScript client. The second is the receiver wiring:
 * two `MESSAGING_EVENT` services would be a coin toss over which one Firebase
 * calls, and the losing side would be the visible notifications the bell
 * depends on.
 */
public class ShellSyncWakeTest {

    @Test
    public void onlyTheSyncTypeIsAWake() {
        assertTrue(ShellSyncWake.isWake(Map.of("type", "sync")));
        assertTrue(ShellSyncWake.isWake(Map.of("type", "sync", "url", "/habitflow")));
        assertFalse(ShellSyncWake.isWake(Map.of("type", "habit_reminder")));
        assertFalse(ShellSyncWake.isWake(Map.of()));
        // A message that lost its type is a message, not a wake: draining on
        // every push would be worse than sleeping through this one.
        assertFalse(ShellSyncWake.isWake(null));
    }

    @Test
    public void theShellDeclaresOneMessagingServiceAndItIsOurs() throws IOException {
        String manifest = readManifest();

        String ours = serviceBlock(manifest, "android:name=\".SyncMessagingService\"");
        assertTrue("the shell's own receiver is not declared", ours.startsWith("<service"));
        assertTrue(
            "the shell's receiver does not listen for FCM",
            ours.contains("com.google.firebase.MESSAGING_EVENT"));

        String plugin = tagContaining(
            manifest, "com.capacitorjs.plugins.pushnotifications.MessagingService");
        assertTrue(
            "the plugin's receiver is not removed, so Firebase has two to choose from",
            plugin.contains("tools:node=\"remove\""));

        assertEquals(
            "the shell must declare exactly one MESSAGING_EVENT receiver",
            1,
            occurrences(manifest, "com.google.firebase.MESSAGING_EVENT"));
    }

    /** The whole `<service>…</service>` block the given needle sits inside. */
    private static String serviceBlock(String xml, String needle) {
        int at = xml.indexOf(needle);
        if (at < 0) return "";

        int open = xml.lastIndexOf('<', at);
        int close = xml.indexOf("</service>", at);
        if (open < 0 || close < 0) return "";
        return xml.substring(open, close + "</service>".length());
    }

    /** The whole XML tag the given needle sits inside. */
    private static String tagContaining(String xml, String needle) {
        int at = xml.indexOf(needle);
        if (at < 0) return "";

        int open = xml.lastIndexOf('<', at);
        int close = xml.indexOf('>', at);
        if (open < 0 || close < 0) return "";
        return xml.substring(open, close + 1);
    }

    private static int occurrences(String haystack, String needle) {
        int count = 0;
        int at = haystack.indexOf(needle);
        while (at >= 0) {
            count++;
            at = haystack.indexOf(needle, at + needle.length());
        }
        return count;
    }

    /** The JVM tests run in `android/app`, but a runner may not; try both layouts. */
    private static String readManifest() throws IOException {
        String[] candidates = {
            "src/main/AndroidManifest.xml",
            "app/src/main/AndroidManifest.xml",
            "android/app/src/main/AndroidManifest.xml",
        };

        for (String candidate : candidates) {
            File file = new File(candidate);
            if (file.exists()) {
                return new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
            }
        }

        fail("AndroidManifest.xml not found; the JVM tests expect to run from android/app "
            + "(cwd " + new File(".").getAbsolutePath() + ")");
        return "";
    }
}
