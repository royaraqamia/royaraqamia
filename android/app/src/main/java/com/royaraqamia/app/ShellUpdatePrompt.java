package com.royaraqamia.app;

import android.app.Activity;
import android.app.Dialog;
import android.graphics.Typeface;
import android.text.TextUtils;
import android.util.DisplayMetrics;
import android.util.Log;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;

import androidx.core.content.res.ResourcesCompat;

import java.io.File;
import java.io.IOException;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Asks the user about a newer APK, then downloads, verifies and installs it
 * (ADR-0043, ADR-0044, ADR-0054).
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
 * Native, but no longer the platform's own dialog. It used to be an
 * `AlertDialog`, which meant it was drawn in the device's alert style: a grey
 * surface that belongs to no part of this product, an accent that was whatever
 * the theme's default happened to be, and — because the theme was a `DayNight`
 * one — a white card on a phone in light mode, sitting on top of a site that
 * renders dark unconditionally. The three cards below are laid out in
 * `res/layout/dialog_shell_update*.xml` and painted from the site's own tokens
 * (`res/values/colors.xml`); the reasoning is ADR-0054.
 *
 * Nothing here installs anything by itself. The platform installer is what asks
 * the last question, and the file it is handed has already been checked against
 * the size and hash the manifest published ({@link ShellDownload}).
 */
final class ShellUpdatePrompt {

    private static final String TAG = "ShellUpdater";
    /** Often enough to hear about a release, rarely enough not to nag. */
    private static final long CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000L;
    /** The width the dialog card stops growing at, before the screen is smaller. */
    private static final int MAX_DIALOG_WIDTH_DP = 400;
    /** The page gutter the site's dialogs keep on a phone. */
    private static final int DIALOG_GUTTER_DP = 24;

    private final Activity activity;
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final String manifestUrl;
    private ShellUpdate.Status status;
    private long lastCheckedAt;
    private boolean asking;
    /** Set while the install waits on the "install unknown apps" setting. */
    private ShellUpdate.Status waitingForPermission;
    private Dialog progressDialog;
    private ProgressBar progressBar;
    private TextView progressPercent;
    private TextView progressSize;
    private Button cancelButton;
    /** Aref Ruqaa's digit face, loaded once for both update cards. */
    private Typeface digitTypeface;
    private int lastPercent = -1;
    /**
     * «إلغاء» was tapped. Read on the download thread, written on the main one,
     * and the only thing that stops a download (ADR-0054) — see
     * {@link ShellDownload.Progress}.
     */
    private volatile boolean cancelRequested;
    /** The activity is gone: nothing may touch a view or show a dialog any more. */
    private boolean destroyed;

    ShellUpdatePrompt(Activity activity, String serverUrl) {
        this.activity = activity;
        this.manifestUrl = ShellUpdate.manifestUrl(serverUrl);
    }

    /** The brand's numeral face, or null if the resource cannot be loaded. */
    private Typeface digitTypeface() {
        if (digitTypeface == null) {
            digitTypeface = ResourcesCompat.getFont(activity, R.font.aref_ruqaa_digits);
        }
        return digitTypeface;
    }

    /**
     * `getString(id, args)` formats with the device locale, which renders a
     * percentage in Arabic-Indic digits on an Arabic phone. `Locale.ROOT` keeps
     * the app's Western digits whatever the device is set to.
     */
    private String formatPercent(int percent) {
        return String.format(
                Locale.ROOT, activity.getString(R.string.shell_update_percent), percent);
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
                onUiThread(() -> {
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
        // A download can outlive the activity that started it, and `runOnUiThread`
        // posts to a handler that outlives it too, so this flag is what stops a
        // finished shell from showing a dialog (`onUiThread`) — `shutdownNow` only
        // stops tasks that have not started.
        destroyed = true;
        hideProgress();
        io.shutdownNow();
    }

    /**
     * Runs UI work only while the shell that asked for it is still alive. Every
     * callback here is reached from the download thread, and the activity may be
     * gone by then: the platform restarts the app when its install permission
     * changes, and a low-memory or "don't keep activities" destruction is just as
     * ordinary. Showing a dialog on a destroyed activity is a `BadTokenException`.
     */
    private void onUiThread(Runnable action) {
        if (destroyed) return;
        activity.runOnUiThread(() -> {
            if (destroyed || activity.isFinishing() || activity.isDestroyed()) return;
            action.run();
        });
    }

    private void maybeAsk() {
        if (destroyed || asking || status == null || !status.updatePending()) return;
        if (!ShellUpdate.isAllowedUpdateUrl(status.apkUrl, BuildConfig.DEBUG)) {
            Log.w(TAG, "an update is published without a usable apkUrl: " + status.apkUrl);
            return;
        }

        asking = true;
        showPrompt(status, 0);
    }

    /**
     * The offer — and, with a `failure` string, the same card reporting that a
     * download did not arrive (ADR-0054).
     *
     * A failed download is a state of this dialog rather than a toast followed by
     * the offer again. What the user is deciding is unchanged either way, and a
     * toast floats away while the thing it is about comes back — so the reason it
     * failed sits where the download was, with «إعادة المحاولة» where
     * «تنزيل وتثبيت» was.
     */
    private void showPrompt(ShellUpdate.Status status, int failure) {
        boolean unsupported = status.unsupported();
        boolean failed = failure != 0;

        View content = activity.getLayoutInflater().inflate(R.layout.dialog_shell_update, null);
        TextView title = content.findViewById(R.id.shell_update_title);
        TextView message = content.findViewById(R.id.shell_update_message);
        TextView meta = content.findViewById(R.id.shell_update_meta);
        Button primary = content.findViewById(R.id.shell_update_primary);
        Button secondary = content.findViewById(R.id.shell_update_secondary);

        title.setText(failed
                ? R.string.shell_update_failed_title
                : unsupported ? R.string.shell_update_required_title : R.string.shell_update_title);
        message.setText(failed
                ? failure
                : unsupported ? R.string.shell_update_required_message : R.string.shell_update_message);
        primary.setText(failed ? R.string.shell_update_retry : R.string.shell_update_install);

        // The versions and the size say nothing about why a download failed, and
        // the manifest that would not download is not made more believable by
        // repeating its numbers.
        String details = failed ? "" : describe(status);
        meta.setText(details);
        DigitSpans.apply(meta, digitTypeface());
        meta.setVisibility(details.isEmpty() ? View.GONE : View.VISIBLE);

        Dialog dialog = new Dialog(activity, R.style.Theme_Royaraqamia_Dialog);
        dialog.setContentView(content);

        // An unsupported shell has nothing to decline, so its offer cannot be
        // backed out of. A *failure* is not that decision — it is a download that
        // did not arrive — so that card can always be dismissed, and a failing
        // connection can never leave a user holding a dialog with one button.
        boolean dismissable = failed || !unsupported;
        dialog.setCancelable(dismissable);
        dialog.setCanceledOnTouchOutside(dismissable);

        primary.setOnClickListener(view -> {
            dialog.dismiss();
            startInstall(status);
        });

        if (unsupported && !failed) {
            secondary.setVisibility(View.GONE);
        } else {
            secondary.setText(R.string.shell_update_later);
            secondary.setOnClickListener(view -> dialog.dismiss());
        }

        dialog.setOnDismissListener(dismissed -> asking = false);

        sizeDialog(dialog);
        dialog.show();
    }

    /**
     * What the card adds about the update itself: «تحديث من 1.0.2 إلى 1.0.4 ·
     * 7.1 م.ب». Either half may be missing and either may stand alone — a
     * manifest published by hand can leave out `versionName` or `sizeBytes`, and
     * a card with no version and no size is still a card worth showing, while an
     * empty row is not.
     */
    private String describe(ShellUpdate.Status status) {
        List<String> parts = new ArrayList<>(2);
        String installed = BuildConfig.VERSION_NAME;
        if (!TextUtils.isEmpty(installed) && !TextUtils.isEmpty(status.versionName)) {
            parts.add(activity.getString(R.string.shell_update_meta, installed, status.versionName));
        }
        if (status.sizeBytes > 0) {
            parts.add(activity.getString(
                    R.string.shell_update_size, ShellUpdate.formatSize(status.sizeBytes)));
        }
        return TextUtils.join(" · ", parts);
    }

    /**
     * The download, the verification, and the hand-over to the platform
     * installer, in that order — and none of them on the main thread.
     */
    private void startInstall(ShellUpdate.Status installing) {
        if (destroyed || installing == null) return;

        if (!ShellInstaller.canInstall(activity)) {
            // Android 8 makes this a per-app permission only the user can grant, so
            // the install is parked rather than failed; `resume` picks it up.
            waitingForPermission = installing;
            Toast.makeText(activity, R.string.shell_update_allow_installs, Toast.LENGTH_LONG).show();
            ShellInstaller.requestPermission(activity);
            return;
        }

        showProgress(installing);
        io.execute(() -> {
            try {
                File apk = ShellInstaller.fetch(activity, installing, this::onProgress);
                Log.i(TAG, "verified " + apk.getName() + " (" + apk.length() + " bytes) against the manifest");
                onUiThread(() -> {
                    hideProgress();
                    try {
                        ShellInstaller.offer(activity, apk);
                    } catch (Exception error) {
                        // Nothing was installed; the file is fine, opening the
                        // installer on it is what failed.
                        Log.w(TAG, "nothing can install " + apk + ": " + error);
                        failed(R.string.shell_update_no_installer);
                    }
                });
            } catch (ShellDownload.Cancelled stopped) {
                // Not a failure: the user said no, and `ShellDownload` has already
                // deleted the partial file on its way out. The offer comes back on
                // the next launch or check rather than immediately, because
                // "إلغاء" is an answer and re-asking would argue with it.
                Log.i(TAG, "the download was cancelled: " + stopped.getMessage());
                onUiThread(() -> {
                    hideProgress();
                    asking = false;
                });
            } catch (ShellDownload.VerificationFailed error) {
                Log.w(TAG, "the update did not verify: " + error.getMessage());
                onUiThread(() -> failed(R.string.shell_update_verify_failed));
            } catch (Exception error) {
                Log.w(TAG, "the update could not be downloaded: " + error);
                onUiThread(() -> failed(R.string.shell_update_download_failed));
            }
        });
    }

    /**
     * The card comes back with the reason, not just a toast — the check that
     * would otherwise bring it back is hours away, and this is a question the
     * user is free to decline.
     *
     * A shell the site has marked unsupported is the exception, and only for the
     * *offer*: its card has no «لاحقًا» and does not dismiss, so re-asking after a
     * failed download would be a dialog whose only button repeats the failure. A
     * failure is shown there too, with «إعادة المحاولة» alone — but dismissable,
     * because the platform restarting the app on a permission change is the only
     * thing that should ever end an unsupported user's session with this card.
     */
    private void failed(int messageId) {
        hideProgress();
        if (destroyed) return;
        if (status == null) return;
        asking = true;
        showPrompt(status, messageId);
    }

    /**
     * Reported from the download thread, so this only touches the bar and the two
     * labels for whole percentages — and on the main thread, where a view may be
     * touched.
     *
     * The throw is the cancel. It is checked before anything else and before the
     * "nothing changed" early return, because a percentage that has not moved is
     * exactly what a stalled download looks like, and that is when a user taps
     * «إلغاء».
     */
    private void onProgress(long received, long total) throws IOException {
        if (cancelRequested) {
            throw new ShellDownload.Cancelled("cancelled at " + received + " of " + total + " bytes");
        }
        if (total <= 0) return;
        int percent = (int) Math.min(100L, received * 100L / total);
        if (percent == lastPercent) return;
        lastPercent = percent;

        String percentText = formatPercent(percent);
        String sizeText = activity.getString(
                R.string.shell_update_progress_size,
                ShellUpdate.formatSize(received),
                ShellUpdate.formatSize(total));
        onUiThread(() -> {
            if (progressBar != null) progressBar.setProgress(percent);
            if (progressPercent != null) {
                progressPercent.setText(percentText);
                DigitSpans.apply(progressPercent, digitTypeface());
            }
            if (progressSize != null) {
                progressSize.setText(sizeText);
                DigitSpans.apply(progressSize, digitTypeface());
            }
        });
    }

    /**
     * The download, on screen, with the one way out of it (ADR-0054).
     *
     * Not cancelable by back or by an outside tap: the file is being written and
     * the installer runs the moment it verifies, so the only honest exit is a
     * gesture that says so. «إلغاء» says it, stops the bytes at the next read, and
     * leaves nothing behind — which is the objection that made this dialog
     * undismissable in the first place, now answered rather than worked around.
     */
    private void showProgress(ShellUpdate.Status installing) {
        if (progressDialog != null) return;

        View content = activity.getLayoutInflater().inflate(R.layout.dialog_shell_update_progress, null);
        progressBar = content.findViewById(R.id.shell_update_progress_bar);
        progressPercent = content.findViewById(R.id.shell_update_progress_percent);
        progressSize = content.findViewById(R.id.shell_update_progress_size);
        cancelButton = content.findViewById(R.id.shell_update_cancel);

        progressPercent.setText(formatPercent(0));
        DigitSpans.apply(progressPercent, digitTypeface());
        if (installing.sizeBytes > 0) {
            progressSize.setText(activity.getString(
                    R.string.shell_update_progress_size,
                    ShellUpdate.formatSize(0),
                    ShellUpdate.formatSize(installing.sizeBytes)));
            DigitSpans.apply(progressSize, digitTypeface());
        } else {
            // A manifest with no size downloads nothing (`ShellDownload` refuses
            // it before the first byte), so this line is about to be replaced by
            // the reason why.
            progressSize.setVisibility(View.GONE);
        }

        cancelButton.setOnClickListener(view -> {
            cancelRequested = true;
            // The download stops at the next read rather than instantly, so the
            // button says so and goes inert instead of looking broken.
            cancelButton.setEnabled(false);
            cancelButton.setText(R.string.shell_update_cancelling);
            cancelButton.setAlpha(0.6f);
        });

        lastPercent = -1;
        progressDialog = new Dialog(activity, R.style.Theme_Royaraqamia_Dialog);
        progressDialog.setContentView(content);
        progressDialog.setCancelable(false);
        progressDialog.setCanceledOnTouchOutside(false);

        sizeDialog(progressDialog);
        progressDialog.show();
    }

    private void hideProgress() {
        if (progressDialog != null) {
            progressDialog.dismiss();
            progressDialog = null;
            progressBar = null;
            progressPercent = null;
            progressSize = null;
            cancelButton = null;
        }
    }

    /**
     * How wide the card is, which is the one thing a layout cannot say: the
     * platform sizes a dialog from `windowMinWidth*`, and those are fractions of
     * the screen — 65% on a tablet is not a dialog. A phone keeps the site's 24dp
     * gutter; anything wider stops at 400dp.
     *
     * Called before `show()`, where it sets the window's attributes, rather than
     * after it, where it would resize a window that is already animating in.
     */
    private void sizeDialog(Dialog dialog) {
        Window window = dialog.getWindow();
        if (window == null) return;
        DisplayMetrics metrics = activity.getResources().getDisplayMetrics();
        int width = Math.min(
                metrics.widthPixels - dp(DIALOG_GUTTER_DP) * 2,
                dp(MAX_DIALOG_WIDTH_DP));
        window.setLayout(width, WindowManager.LayoutParams.WRAP_CONTENT);
    }

    private int dp(int value) {
        return Math.round(value * activity.getResources().getDisplayMetrics().density);
    }
}
