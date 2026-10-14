package com.royaraqamia.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;
import android.widget.Toast;

import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Asks the user about a newer APK (ADR-0043).
 *
 * This is deliberately native rather than something the page renders. The page
 * is the nicer place for it — same fonts, same RTL layout, one prompt in total —
 * and it was built that way first: a local Capacitor plugin, read through
 * `window.Capacitor.Plugins`. The emulator drill answered that question the other
 * way. With `server.url` set, Capacitor injects its bridge into the remote
 * document through a proxy, and on the WebView this app still meets on older
 * devices (83 on the API 30 image) a proxied request that fails takes the whole
 * injected script with it: `window.Capacitor` is simply absent, so the page has
 * no way to reach the shell. An update prompt that only appears on new WebViews
 * is worse than a platform dialog that always appears.
 *
 * So the shell owns its own announcement, and it asks at most once per
 * {@link #CHECK_INTERVAL_MS} and on a fresh launch. What is left for the page is
 * not to double up: it can see which shell it is in from its own user agent (see
 * {@link MainActivity#announceShellVersion}) and stays quiet while this is
 * pending.
 */
final class ShellUpdatePrompt {

    private static final String TAG = "ShellUpdater";
    /** Often enough to hear about a release, rarely enough not to nag. */
    private static final long CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000L;

    private final Activity activity;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final String manifestUrl;
    private ShellUpdate.Status status;
    private long lastCheckedAt;
    private boolean asking;

    ShellUpdatePrompt(Activity activity, String serverUrl) {
        this.activity = activity;
        this.manifestUrl = ShellUpdate.manifestUrl(serverUrl);
    }

    /**
     * Reads the manifest and, when a newer APK exists, asks about it. `force` is
     * for a fresh launch; the interval is for a shell that is resumed over and
     * over in one sitting.
     */
    void maybeCheck(boolean force) {
        if (manifestUrl == null) return;
        long now = System.currentTimeMillis();
        if (!force && now - lastCheckedAt < CHECK_INTERVAL_MS) return;
        lastCheckedAt = now;

        final int installedCode = BuildConfig.VERSION_CODE;
        io.execute(() -> {
            try {
                ShellUpdate.Status checked = ShellUpdate.check(manifestUrl, installedCode);
                Log.i(TAG, "checked " + manifestUrl + ": installed=" + checked.installedCode
                        + " latest=" + checked.latestCode + " pending=" + checked.updatePending());
                activity.runOnUiThread(() -> {
                    status = checked;
                    maybeAsk();
                });
            } catch (Exception error) {
                // Offline, or the manifest is not published yet: not an event.
                Log.w(TAG, "check failed for " + manifestUrl + ": " + error);
            }
        });
    }

    void shutdown() {
        io.shutdown();
    }

    private void maybeAsk() {
        if (asking || status == null || !status.updatePending()) return;
        if (!ShellUpdate.isOpenableApkUrl(status.apkUrl)) {
            Log.w(TAG, "an update is published without a usable apkUrl: " + status.apkUrl);
            return;
        }

        asking = true;
        AlertDialog.Builder builder = new AlertDialog.Builder(activity)
                .setTitle(status.unsupported() ? R.string.shell_update_required_title : R.string.shell_update_title)
                .setMessage(status.unsupported()
                        ? R.string.shell_update_required_message
                        : R.string.shell_update_message)
                .setPositiveButton(R.string.shell_update_install,
                        (dialog, which) -> openDownload(status.apkUrl));

        if (status.unsupported()) {
            // The site has said this shell is too old; there is nothing to decline.
            builder.setCancelable(false);
        } else {
            builder.setNegativeButton(R.string.shell_update_later, null);
        }

        builder.setOnDismissListener(dialog -> asking = false);
        builder.show();
    }

    private void openDownload(String apkUrl) {
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse(apkUrl));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            activity.startActivity(intent);
        } catch (ActivityNotFoundException error) {
            Log.w(TAG, "nothing can open " + apkUrl + ": " + error);
            Toast.makeText(activity, R.string.shell_update_no_handler, Toast.LENGTH_LONG).show();
        }
    }
}
