package com.royaraqamia.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.json.JSONException;
import org.junit.Test;

/**
 * The shell's update decision (ADR-0043), on the JVM: the comparison that decides
 * whether a user is told about a new APK is not something to discover on a
 * device. `org.json` comes from the JVM dependency in `app/build.gradle` so the
 * real parser is exercised here rather than android.jar's stub.
 */
public class ShellUpdateTest {

    @Test
    public void manifestUrlKeepsTheOriginAndDropsThePath() {
        assertEquals(
            "https://royaraqamia.com/android/latest.json",
            ShellUpdate.manifestUrl("https://royaraqamia.com")
        );
        assertEquals(
            "https://royaraqamia.com/android/latest.json",
            ShellUpdate.manifestUrl("https://royaraqamia.com/some/deep/link?x=1#fragment")
        );
        // The dev drill points the shell at a local server, and the manifest has
        // to come from the same place.
        assertEquals(
            "http://10.0.2.2:3000/android/latest.json",
            ShellUpdate.manifestUrl("http://10.0.2.2:3000")
        );
    }

    @Test
    public void manifestUrlRefusesWhatItCannotParse() {
        assertNull(ShellUpdate.manifestUrl(null));
        assertNull(ShellUpdate.manifestUrl(""));
        assertNull(ShellUpdate.manifestUrl("/android/latest.json"));
    }

    @Test
    public void aHigherPublishedCodeIsAnUpdate() throws JSONException {
        ShellUpdate.Status status = ShellUpdate.parse(
            "{\"versionCode\": 2, \"versionName\": \"1.92.0+shell.2\", "
                + "\"apkUrl\": \"https://example.test/shell-2.apk\", \"minSupportedVersionCode\": 1, "
                + "\"sha256\": \"abababababababababababababababababababababababababababababababab\", "
                + "\"sizeBytes\": 10700000}",
            1
        );

        assertTrue(status.updatePending());
        assertFalse(status.unsupported());
        assertEquals(1, status.installedCode);
        assertEquals(2, status.latestCode);
        assertEquals("https://example.test/shell-2.apk", status.apkUrl);
        // The install half needs both of these: the file that arrives has to be
        // the file the manifest described (ADR-0044).
        assertEquals(
            "abababababababababababababababababababababababababababababababab",
            status.sha256
        );
        assertEquals(10700000L, status.sizeBytes);
    }

    @Test
    public void theInstalledCodeIsNotAnUpdate() throws JSONException {
        ShellUpdate.Status same = ShellUpdate.parse("{\"versionCode\": 1}", 1);
        ShellUpdate.Status behind = ShellUpdate.parse("{\"versionCode\": 1}", 2);

        assertFalse(same.updatePending());
        assertFalse(behind.updatePending());
    }

    @Test
    public void aWithdrawnReleaseIsNotAnUpdate() throws JSONException {
        // The manifest is republished for every release; if it ever names an
        // older code than the installed shell, that is not an update to offer.
        ShellUpdate.Status status = ShellUpdate.parse("{\"versionCode\": 1}", 3);

        assertFalse(status.updatePending());
    }

    @Test
    public void aBareManifestCannotTalkAnyoneIntoAnInstall() throws JSONException {
        ShellUpdate.Status empty = ShellUpdate.parse("{}", 1);
        ShellUpdate.Status partial = ShellUpdate.parse("{\"versionCode\": 2}", 1);

        assertFalse(empty.updatePending());
        assertEquals("", empty.apkUrl);
        // Pending, but with nothing to point at: the install action refuses an
        // empty apkUrl, so the page cannot offer a download that does not exist.
        assertTrue(partial.updatePending());
        assertEquals("", partial.apkUrl);
    }

    @Test
    public void anOldShellIsUnsupportedRatherThanMerelyBehind() throws JSONException {
        ShellUpdate.Status status = ShellUpdate.parse(
            "{\"versionCode\": 4, \"minSupportedVersionCode\": 3}",
            1
        );

        assertTrue(status.updatePending());
        assertTrue(status.unsupported());
    }

    @Test
    public void idleReportsNothingOnEitherAxis() {
        ShellUpdate.Status status = ShellUpdate.idle(7);

        assertEquals(7, status.installedCode);
        assertFalse(status.updatePending());
        assertFalse(status.unsupported());
        assertEquals("", status.apkUrl);
        assertEquals("", status.sha256);
        assertEquals(0L, status.sizeBytes);
    }

    @Test
    public void aByteOrderMarkDoesNotHideTheUpdate() throws JSONException {
        // Written by an editor on Windows and served as-is: unreadable here would
        // mean the channel is down on every device, silently.
        ShellUpdate.Status status = ShellUpdate.parse("\uFEFF{\"versionCode\": 2}", 1);

        assertTrue(status.updatePending());
    }

    @Test
    public void httpsIsAlwaysAllowed() {
        assertTrue(ShellUpdate.isAllowedUpdateUrl("https://example.test/shell-2.apk", false));
        assertTrue(ShellUpdate.isAllowedUpdateUrl("https://example.test/shell-2.apk", true));
        assertTrue(ShellUpdate.isAllowedUpdateUrl(
            "https://github.com/royaraqamia/royaraqamia/releases/download/shell/royaraqamia-shell.apk",
            false
        ));
    }

    @Test
    public void cleartextIsAllowedOnlyForADevServerAndOnlyInDebug() {
        // The emulator reaches its host on 10.0.2.2, which is how the install path
        // is exercised on a device before anything is published.
        assertTrue(ShellUpdate.isAllowedUpdateUrl("http://10.0.2.2:3000/shell-2.apk", true));
        assertTrue(ShellUpdate.isAllowedUpdateUrl("http://localhost:3000/shell-2.apk", true));

        // Never in a build a user has.
        assertFalse(ShellUpdate.isAllowedUpdateUrl("http://10.0.2.2:3000/shell-2.apk", false));
        assertFalse(ShellUpdate.isAllowedUpdateUrl("http://localhost:3000/shell-2.apk", false));
        // And not for an address that is not a dev server, debug or not. The host
        // is matched whole: a name that merely starts with one of these must not
        // pass, because that is how an attacker would spell their own host.
        assertFalse(ShellUpdate.isAllowedUpdateUrl("http://example.test/shell-2.apk", true));
        assertFalse(ShellUpdate.isAllowedUpdateUrl("http://10.0.2.2.example.test/shell-2.apk", true));
        assertFalse(ShellUpdate.isAllowedUpdateUrl("http://localhost.example.test/shell-2.apk", true));
        assertFalse(ShellUpdate.isAllowedUpdateUrl("http://127.0.0.1.example.test/shell-2.apk", true));
        // Ports, paths and credentials do not change the host, and http to a dev
        // host with any of them is still a dev host.
        assertTrue(ShellUpdate.isAllowedUpdateUrl("http://10.0.2.2:8080/a/b.apk?x=1", true));
    }

    @Test
    public void onlyNetworkUrlsAreInstallable() {
        assertFalse(ShellUpdate.isAllowedUpdateUrl("", true));
        assertFalse(ShellUpdate.isAllowedUpdateUrl(null, true));
        // A manifest that named one of these would be asking the shell to install
        // something already on the device rather than a download.
        assertFalse(ShellUpdate.isAllowedUpdateUrl("file:///data/local/tmp/shell-2.apk", true));
        assertFalse(ShellUpdate.isAllowedUpdateUrl("intent://install#Intent;scheme=https;end", true));
        assertFalse(ShellUpdate.isAllowedUpdateUrl("content://example/shell-2.apk", true));
        assertFalse(ShellUpdate.isAllowedUpdateUrl("not a url", true));
    }

    @Test
    public void aSizeReadsInMebibytesToPlace() {
        // What the dialog prints for the published APK (7,449,653 bytes), and for
        // the sizes either side of it. Binary megabytes, because that is what
        // Android's own file sizes use: 7.4 would be the decimal reading, and the
        // manifest's number is the one in Android's app-info screen.
        assertEquals("7.1", ShellUpdate.formatSize(7_449_653L));
        assertEquals("0.5", ShellUpdate.formatSize(524_288L));
        assertEquals("0.1", ShellUpdate.formatSize(104_858L));
    }

    @Test
    public void aWholeNumberOfMebibytesDropsTheTenth() {
        // «30 م.ب», not «30.0 م.ب»: the zero tenth is noise in a sentence about
        // how big a download is, and it is what a hand-published manifest is
        // least likely to hit exactly.
        assertEquals("1", ShellUpdate.formatSize(1_048_576L));
        assertEquals("30", ShellUpdate.formatSize(30L * 1024 * 1024));
        assertEquals("7", ShellUpdate.formatSize(7L * 1024 * 1024));
    }

    @Test
    public void aSizeNobodyCanMeanStillRenders() {
        // The manifest is a document that arrives over the network, and `sizeBytes`
        // is `optLong`: absent, zero and negative are all reachable without the
        // dialog crashing on the way to reporting that there is nothing to install.
        assertEquals("0", ShellUpdate.formatSize(0));
        assertEquals("0", ShellUpdate.formatSize(-1));
    }

    @Test
    public void aSizeAlwaysUsesALatinDecimalPoint() {
        // `Locale.ROOT`, not the device's: an Arabic-locale device would otherwise
        // render «7,1» beside a version number that is already Latin.
        String size = ShellUpdate.formatSize(7_449_653L);

        assertEquals("7.1", size);
        assertFalse(size.contains(","));
    }
}
