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
                + "\"apkUrl\": \"https://example.test/shell-2.apk\", \"minSupportedVersionCode\": 1}",
            1
        );

        assertTrue(status.updatePending());
        assertFalse(status.unsupported());
        assertEquals(1, status.installedCode);
        assertEquals(2, status.latestCode);
        assertEquals("https://example.test/shell-2.apk", status.apkUrl);
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
    }

    @Test
    public void aByteOrderMarkDoesNotHideTheUpdate() throws JSONException {
        // Written by an editor on Windows and served as-is: unreadable here would
        // mean the channel is down on every device, silently.
        ShellUpdate.Status status = ShellUpdate.parse("\uFEFF{\"versionCode\": 2}", 1);

        assertTrue(status.updatePending());
    }

    @Test
    public void onlyNetworkUrlsAreOpenable() {
        assertTrue(ShellUpdate.isOpenableApkUrl("https://example.test/shell-2.apk"));
        // The dev drill serves the APK over cleartext from the host.
        assertTrue(ShellUpdate.isOpenableApkUrl("http://10.0.2.2:3000/shell-2.apk"));

        assertFalse(ShellUpdate.isOpenableApkUrl(""));
        assertFalse(ShellUpdate.isOpenableApkUrl(null));
        // A manifest that named one of these would be asking the shell to open
        // something on the device rather than a download.
        assertFalse(ShellUpdate.isOpenableApkUrl("file:///data/local/tmp/shell-2.apk"));
        assertFalse(ShellUpdate.isOpenableApkUrl("intent://install#Intent;scheme=https;end"));
        assertFalse(ShellUpdate.isOpenableApkUrl("not a url"));
    }
}
