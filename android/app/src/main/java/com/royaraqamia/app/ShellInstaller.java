package com.royaraqamia.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.FileProvider;

import java.io.File;
import java.io.IOException;

/**
 * Hands a verified APK to the platform installer (ADR-0044).
 *
 * Nothing here installs anything. The package installer is the only thing that
 * may, and it asks the user itself; what this does is put a verified file where
 * that installer can read it, and — when the app is not allowed to install
 * packages at all yet — send the user to the one setting that changes that. From
 * Android 8 that switch is per app, and only the user can flip it.
 */
final class ShellInstaller {

    private static final String TAG = "ShellUpdater";
    private static final String PACKAGE_ARCHIVE = "application/vnd.android.package-archive";
    /**
     * App-private internal storage (`getFilesDir()`). The external files
     * directory would work and is easier to inspect, but on API 24–29 another app
     * holding storage permission can write there, which would leave a window
     * between verifying the file and handing it to the installer. Internal
     * storage is unreadable by other apps on every supported API level, and the
     * installer reaches the one file it needs through the FileProvider, which
     * grants exactly one URI for exactly as long as the install runs.
     */
    private static final String DIR = "updates";

    private ShellInstaller() {}

    /** Downloads and verifies the APK the manifest describes. */
    static File fetch(Activity activity, ShellUpdate.Status status, ShellDownload.Progress progress)
            throws IOException {
        File target = target(activity, status.latestCode);
        File directory = target.getParentFile();
        if (!directory.isDirectory() && !directory.mkdirs()) {
            throw new IOException("could not create " + directory);
        }
        // One APK at a time: a verified download is kept, everything else goes.
        File[] files = directory.listFiles();
        if (files != null) {
            for (File file : files) {
                if (!file.equals(target)) file.delete();
            }
        }
        return ShellDownload.fetch(status.apkUrl, target, status.sizeBytes, status.sha256, progress);
    }

    /**
     * Whether Android will let this app hand an APK to the installer. From
     * Android 8 it is a per-app permission the user grants in Settings; before
     * that it was a single global switch this app cannot read, so the install is
     * not blocked by us.
     */
    static boolean canInstall(Activity activity) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return true;
        return activity.getPackageManager().canRequestPackageInstalls();
    }

    static void requestPermission(Activity activity) {
        Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES)
                .setData(Uri.parse("package:" + activity.getPackageName()));
        try {
            activity.startActivity(intent);
        } catch (ActivityNotFoundException missing) {
            // Some builds have no such screen; the app's own settings page is the
            // nearest thing, and a dead end would be worse than an approximate one.
            Log.w(TAG, "no unknown-sources screen: " + missing);
            Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
                    .setData(Uri.parse("package:" + activity.getPackageName()));
            try {
                activity.startActivity(fallback);
            } catch (ActivityNotFoundException alsoMissing) {
                Log.w(TAG, "no application settings screen either: " + alsoMissing);
            }
        }
    }

    /** Opens the system installer on the APK. */
    @SuppressWarnings("deprecation") // ACTION_INSTALL_PACKAGE is the fallback below Android 8.
    static void offer(Activity activity, File apk) throws IOException {
        Uri uri = FileProvider.getUriForFile(activity, activity.getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW)
                .setDataAndType(uri, PACKAGE_ARCHIVE)
                .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            activity.startActivity(intent);
        } catch (ActivityNotFoundException missing) {
            // ACTION_VIEW with this type is the supported spelling from Android 8;
            // minSdk is 24, and the older spelling is still what older images answer.
            Intent legacy = new Intent(Intent.ACTION_INSTALL_PACKAGE)
                    .setData(uri)
                    .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
            try {
                activity.startActivity(legacy);
            } catch (ActivityNotFoundException alsoMissing) {
                throw new IOException("this device has no package installer", alsoMissing);
            }
        }
    }

    private static File target(Activity activity, int versionCode) {
        return new File(new File(activity.getFilesDir(), DIR), "royaraqamia-shell-" + versionCode + ".apk");
    }
}
