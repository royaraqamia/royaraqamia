package com.royaraqamia.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.util.Log;
import android.view.View;
import android.widget.ProgressBar;
import android.widget.Toast;

import java.io.File;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Asks the user about a newer APK, then downloads, verifies and installs it
 * (ADR-0043, ADR-0044).
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
 *
 * Nothing here installs anything by itself. The platform installer is what asks
 * the last question, and the file it is handed has already been checked against
 * the size and hash the manifest published ({@link ShellDownload}).
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
    /** Set while the install waits on the "install unknown apps" setting. */
    private ShellUpdate.Status waitingForPermission;
    private AlertDialog progressDialog;
    private ProgressBar progressBar;
    private int lastPercent = -1;

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

    /**
     * Called when the shell comes back to the foreground. An install that was
     * waiting on the "install unknown apps" setting gets to continue here — but
     * the drill measured that this usually cannot happen: granting that setting
     * restarts the app (the process id changed the moment the toggle moved), so
     * the parked install goes with the process and the prompt simply comes back.
     * Kept because the restart is the platform's behaviour rather than a contract
     * — where the process does survive the trip, this is the difference between
     * continuing and making the user tap again.
     */
    void resume() {
        if (waitingForPermission == null) return;
        if (!ShellInstaller.canInstall(activity)) return;
        ShellUpdate.Status installing = waitingForPermission;
        waitingForPermission = null;
        startInstall(installing);
    }

    void shutdown() {
        hideProgress();
        io.shutdown();
    }

    private void maybeAsk() {
        if (asking || status == null || !status.updatePending()) return;
        if (!ShellUpdate.isAllowedUpdateUrl(status.apkUrl, BuildConfig.DEBUG)) {
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
                        (dialog, which) -> startInstall(status));

        if (status.unsupported()) {
            // The site has said this shell is too old; there is nothing to decline.
            builder.setCancelable(false);
        } else {
            builder.setNegativeButton(R.string.shell_update_later, null);
        }

        builder.setOnDismissListener(dialog -> asking = false);
        builder.show();
    }

    /**
     * The download, the verification, and the hand-over to the platform
     * installer, in that order — and none of them on the main thread.
     */
    private void startInstall(ShellUpdate.Status installing) {
        if (installing == null) return;

        if (!ShellInstaller.canInstall(activity)) {
            // Android 8 makes this a per-app permission only the user can grant, so
            // the install is parked rather than failed; `resume` picks it up.
            waitingForPermission = installing;
            Toast.makeText(activity, R.string.shell_update_allow_installs, Toast.LENGTH_LONG).show();
            ShellInstaller.requestPermission(activity);
            return;
        }

        showProgress();
        io.execute(() -> {
            try {
                File apk = ShellInstaller.fetch(activity, installing, this::onProgress);
                Log.i(TAG, "verified " + apk.getName() + " (" + apk.length() + " bytes) against the manifest");
                activity.runOnUiThread(() -> {
                    hideProgress();
                    try {
                        ShellInstaller.offer(activity, apk);
                    } catch (Exception error) {
                        Log.w(TAG, "nothing can install " + apk + ": " + error);
                        failed(R.string.shell_update_download_failed);
                    }
                });
            } catch (ShellDownload.VerificationFailed error) {
                Log.w(TAG, "the update did not verify: " + error.getMessage());
                activity.runOnUiThread(() -> failed(R.string.shell_update_verify_failed));
            } catch (Exception error) {
                Log.w(TAG, "the update could not be downloaded: " + error);
                activity.runOnUiThread(() -> failed(R.string.shell_update_download_failed));
            }
        });
    }

    /**
     * A Toast and the prompt again, not just the Toast: the check that would
     * otherwise bring it back is hours away, and this is a question the user is
     * free to decline.
     */
    private void failed(int messageId) {
        hideProgress();
        Toast.makeText(activity, messageId, Toast.LENGTH_LONG).show();
        asking = false;
        maybeAsk();
    }

    /**
     * Reported from the download thread, so this only touches the bar for whole
     * percentages — and on the main thread, where a view may be touched.
     */
    private void onProgress(long received, long total) {
        if (total <= 0) return;
        int percent = (int) Math.min(100L, received * 100L / total);
        if (percent == lastPercent) return;
        lastPercent = percent;
        activity.runOnUiThread(() -> {
            if (progressBar != null) progressBar.setProgress(percent);
        });
    }

    private void showProgress() {
        if (progressDialog != null) return;
        View content = activity.getLayoutInflater().inflate(R.layout.dialog_shell_update_progress, null);
        progressBar = content.findViewById(R.id.shell_update_progress_bar);
        lastPercent = -1;
        // Not cancelable: the download is running, and backing out of it would
        // leave a file nobody asked about.
        progressDialog = new AlertDialog.Builder(activity)
                .setTitle(R.string.shell_update_title)
                .setView(content)
                .setCancelable(false)
                .create();
        progressDialog.show();
    }

    private void hideProgress() {
        if (progressDialog != null) {
            progressDialog.dismiss();
            progressDialog = null;
            progressBar = null;
        }
    }
}
