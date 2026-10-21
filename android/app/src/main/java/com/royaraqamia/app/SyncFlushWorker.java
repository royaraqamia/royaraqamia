package com.royaraqamia.app;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.annotation.NonNull;
import androidx.work.Worker;
import androidx.work.WorkerParameters;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Drains the Outbox with the app backgrounded or closed (ADR-0059).
 *
 * The shell is a remote-URL WebView with no native background components, so a
 * write queued while the app is not in front waits for the next open. This is what
 * comes back for it: the page's pending signal (or the 15-minute floor) wakes this
 * job, and the job loads `/sync-flush.html` in a **headless WebView** — the same
 * WebView profile as the app, so the same cookies and the same IndexedDB — and
 * waits for it to report what it drained.
 *
 * Running the *web* drain rather than replaying five transports in Java is the
 * decision ADR-0059 makes and this class is what honours it: the Outbox keeps one
 * implementation, so the background path cannot disagree with the page about
 * ordering, backoff, identities or what an intent means.
 *
 * The WebView is built on the main thread (it owns a Looper there and, in this
 * process, nothing else is using it) and destroyed there once the report lands, so
 * a drain that gives up cannot leave a WebView behind.
 */
public class SyncFlushWorker extends Worker {

    static final String LOG_TAG = "RoySyncFlush";
    /** Long enough for a slow drain over a bad connection, short of WorkManager's 10. */
    static final long PAGE_TIMEOUT_MS = 60_000;
    /** Attempts before the worker stops asking: doze time is not a reason to loop. */
    static final int MAX_ATTEMPTS = 5;

    public SyncFlushWorker(@NonNull Context context, @NonNull WorkerParameters params) {
        super(context, params);
    }

    @NonNull
    @Override
    public Result doWork() {
        Context context = getApplicationContext();
        String origin = ShellServer.origin(context);

        // No packaged config means this build cannot reach its own site at all:
        // `cap sync` writes that asset, so its absence is a build mistake and not
        // a condition to retry against.
        if (origin == null) {
            Log.e(LOG_TAG, "no origin in the packaged " + ShellServer.CONFIG_ASSET + ": nothing to drain");
            return Result.failure();
        }

        Page page = load(origin, ShellServer.pageUrl(origin, ShellServer.FLUSH_PATH));
        SyncFlushResult result = SyncFlushResult.parse(page.report);

        if (!result.retry) {
            Log.i(LOG_TAG, result.summary);
            return Result.success();
        }

        // Something is still owed: the ADR-0059 amendment's exemption prompt
        // follows this moment, gated to one ask (see `ShellBatteryPrompt`) and
        // reached here for both exits below — the retry and the give-up are
        // different ends of one schedule, but the queue is not empty after
        // either of them.
        ShellBatteryPrompt.promptIfNeeded(context);

        String why = page.note == null ? result.summary : result.summary + " (" + page.note + ")";
        if (getRunAttemptCount() >= MAX_ATTEMPTS) {
            // The queue is durable and the page still flushes on open, so this is
            // the end of *this* schedule rather than a lost write.
            Log.w(LOG_TAG, "giving up after " + getRunAttemptCount() + " attempts: " + why);
            return Result.failure();
        }

        Log.i(LOG_TAG, "queued another attempt: " + why);
        return Result.retry();
    }

    /** A drain attempt: what the page said, and why it said nothing. */
    private static final class Page {
        final String report;
        final String note;

        Page(String report, String note) {
            this.report = report;
            this.note = note;
        }
    }

    /**
     * Loads the drain page and waits for its report.
     *
     * Every failure it can meet — a WebView that will not construct, a document
     * that never reports, a load error — comes back as a `note` with no report, so
     * the caller's decision stays in one place (`SyncFlushResult.parse`).
     */
    private Page load(String origin, String url) {
        AtomicReference<String> report = new AtomicReference<>();
        AtomicReference<String> note = new AtomicReference<>();
        CountDownLatch done = new CountDownLatch(1);
        Handler main = new Handler(Looper.getMainLooper());
        AtomicReference<WebView> holder = new AtomicReference<>();

        main.post(() -> {
            try {
                WebView view = new WebView(getApplicationContext());
                holder.set(view);

                WebSettings settings = view.getSettings();
                // The drain is JavaScript by definition, and IndexedDB is what the
                // WebView gates DOM storage behind.
                settings.setJavaScriptEnabled(true);
                settings.setDomStorageEnabled(true);
                settings.setAllowFileAccess(false);
                settings.setAllowContentAccess(false);

                view.setWebViewClient(new WebViewClient() {
                    @Override
                    public boolean shouldOverrideUrlLoading(WebView ignored, WebResourceRequest request) {
                        // This WebView holds the session cookie, so a navigation
                        // away from our origin would be carrying it somewhere else.
                        String target = ShellServer.originOf(request.getUrl().toString());
                        return target == null || !origin.equals(target);
                    }

                    @Override
                    public void onReceivedError(
                            WebView ignored, WebResourceRequest request, WebResourceError error) {
                        if (!request.isForMainFrame()) return;
                        note.compareAndSet(null, "the drain page could not load: " + error.getDescription());
                        done.countDown();
                    }
                });

                // `adb logcat` is where a device-side drain explains itself; the
                // page's own console line is the only thing here that knows which
                // products moved.
                view.setWebChromeClient(new WebChromeClient() {
                    @Override
                    public boolean onConsoleMessage(ConsoleMessage message) {
                        Log.i(LOG_TAG, "page: " + message.message());
                        return true;
                    }
                });

                view.addJavascriptInterface(
                    ShellSyncBridge.forDrain(json -> {
                        report.set(json);
                        done.countDown();
                    }),
                    ShellSyncBridge.NAME
                );

                view.loadUrl(url);
            } catch (Throwable error) {
                // A device with no usable WebView provider, or one being updated:
                // the write stays durable and the next wake tries again.
                note.compareAndSet(null, "the drain page could not start: " + error);
                done.countDown();
            }
        });

        long deadline = System.currentTimeMillis() + PAGE_TIMEOUT_MS;
        boolean settled = false;
        while (!settled) {
            try {
                settled = done.await(1, TimeUnit.SECONDS);
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
                break;
            }
            if (isStopped()) break;
            if (System.currentTimeMillis() >= deadline) break;
        }

        main.post(() -> {
            WebView view = holder.get();
            if (view == null) return;
            view.removeJavascriptInterface(ShellSyncBridge.NAME);
            view.stopLoading();
            view.destroy();
        });

        String silence = settled ? null : "the drain page did not report within " + PAGE_TIMEOUT_MS + "ms";
        return new Page(report.get(), note.get() != null ? note.get() : silence);
    }
}
