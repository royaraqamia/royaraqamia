package com.royaraqamia.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import static org.junit.Assert.fail;

import java.io.File;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.text.Normalizer;
import org.junit.Test;

/**
 * The battery-exemption ask, at its two moments (ADR-0059's amendment, #381).
 *
 * Three things break silently. The first is the decision: unchecked, the gate
 * would spend the one ask on a device that already holds the exemption, or on a
 * user actively holding the app, or on a notification Android would silently
 * drop — each a question the next moment was owed instead. The second is the
 * permission: without `REQUEST_IGNORE_BATTERY_OPTIMIZATIONS` the one-tap
 * dialog's intent is refused before any dialog is drawn, the way the camera
 * request once was, and the shell cannot grant that voice for itself at
 * runtime. The third is the copy: a request the ADR promised "with the reason
 * stated" breaks as soon as a shift in encoding makes the string unreadable to
 * itself.
 */
public class ShellBatteryPromptTest {

    @Test
    public void theGateDropsEveryConditionOutOfTheAsk() {
        // The clean case: owed, silent, in the background, notifications on.
        assertTrue(ShellBatteryPrompt.shouldAsk(false, false, false, true));

        // Already exempt: the system stores the grant, asking again is noise.
        assertFalse(ShellBatteryPrompt.shouldAsk(true, false, false, true));

        // Asked before: a decline is an answer, not something to argue with.
        assertFalse(ShellBatteryPrompt.shouldAsk(false, true, false, true));

        // The app is up: the page reports what is owed, the pill is the surface.
        assertFalse(ShellBatteryPrompt.shouldAsk(false, false, true, true));

        // Notifications off: the ask would silently no-op and must not be spent.
        assertFalse(ShellBatteryPrompt.shouldAsk(false, false, false, false));
    }

    @Test
    public void theShellDeclaresTheExemptionPermissionOnce() throws IOException {
        String manifest = readResource("AndroidManifest.xml");

        assertEquals(
            "the one-tap dialog needs exactly this permission; declared twice is a typo",
            1,
            occurrences(manifest, "android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS"));
    }

    /**
     * The copy is asked for with the reason stated, so it has to reach the
     * reader as written: every string is NFC (the two orders of combining marks
     * render identically and compare unequal), and every digit in it is ASCII —
     * the repo's own gate (`npm run check:digits`) does not see this file's
     * resource form, so the test says the same thing the site's copy says.
     */
    @Test
    public void theCopiesAreNfcAndCarryOnlyAsciiDigits() throws IOException {
        String strings = readResource("strings.xml");

        for (String name : new String[] {
            "battery_channel_name", "battery_channel_description",
            "battery_prompt_title", "battery_prompt_message",
        }) {
            String text = stringResource(strings, name);
            assertTrue("the strings.xml almost names " + name, !text.isEmpty());
            assertEquals("battery string " + name + " is not NFC",
                    text, Normalizer.normalize(text, Normalizer.Form.NFC));
            assertEquals("battery string " + name + " carries non-ASCII digits", text,
                    text.replaceAll("[\u0660-\u0669\u06F0-\u06F9]", "_"));
        }
    }

    /** The `battery_` names each live in `values/strings.xml`, right where the site's own strings sit. */
    private static String stringResource(String xml, String name) {
        int at = xml.indexOf("name=\"" + name + "\"");
        if (at < 0) return "";

        int open = xml.indexOf('>', at);
        int close = xml.indexOf("</string>", at);
        if (open < 0 || close < 0) return "";
        return xml.substring(open + 1, close).trim();
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
    private static String readResource(String fileName) throws IOException {
        String[] candidates = {
            "src/main/AndroidManifest.xml",
            "src/main/res/values/strings.xml",
            "app/src/main/AndroidManifest.xml",
            "app/src/main/res/values/strings.xml",
        };

        for (String candidate : candidates) {
            if (!candidate.replace('\\', '/').endsWith(fileName)) continue;
            File file = new File(candidate);
            if (file.exists()) {
                return new String(Files.readAllBytes(file.toPath()), StandardCharsets.UTF_8);
            }
        }

        fail(fileName + " not found; the JVM tests expect to run from android/app "
            + "(cwd " + new File(".").getAbsolutePath() + ")");
        return "";
    }
}
