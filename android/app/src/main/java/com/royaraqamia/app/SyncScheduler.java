package com.royaraqamia.app;

import android.content.Context;

import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.ExistingWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.OneTimeWorkRequest;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import java.util.concurrent.TimeUnit;

/**
 * When the shell drains the Outbox (ADR-0059).
 *
 * Two schedules, and the split is the design:
 *
 * - **On demand**, from the page's own pending count: the app's WebView signals
 *   through `RoyShellSync.schedule()` after a flush left something behind, which
 *   is the same condition that registers a Background Sync tag on the web
 *   (ADR-0058). Nothing else schedules a drain, so a shell sitting with an empty
 *   queue does no work at all.
 * - **Every 15 minutes**, as the floor: it is the shortest interval WorkManager
 *   allows and doze defers it further, but it is what recovers the cases the
 *   signal cannot cover — a shell built before the signal existed, a write queued
 *   by a page whose signal was lost with the process, and a drain that gave up
 *   after its attempts.
 *
 * Both are constrained to a connected network, because a drain that wakes with no
 * network would do nothing but burn an attempt, and WorkManager's answer to that
 * is to wait for the connection — which is exactly the moment the queue should
 * move.
 */
final class SyncScheduler {

    /** The drain's own tag, so `adb shell dumpsys jobscheduler` reads legibly. */
    static final String TAG = "royaraqamia-outbox";
    /** Unique work names: one periodic floor and one on-demand drain, ever. */
    static final String PERIODIC_WORK = "royaraqamia-outbox-periodic";
    static final String ON_DEMAND_WORK = "royaraqamia-outbox-now";
    static final long PERIOD_MINUTES = 15;
    /** WorkManager's floor for a retry: it grows from here, exponentially. */
    static final long BACKOFF_SECONDS = 30;

    private SyncScheduler() {}

    /**
     * The 15-minute floor. `KEEP` rather than `REPLACE`: this runs on every launch,
     * and replacing the request would reset the period and the next run's clock on
     * every cold start.
     */
    static void ensurePeriodic(Context context) {
        PeriodicWorkRequest request = new PeriodicWorkRequest.Builder(
                SyncFlushWorker.class, PERIOD_MINUTES, TimeUnit.MINUTES)
            .setConstraints(networkConstraints())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_SECONDS, TimeUnit.SECONDS)
            .addTag(TAG)
            .build();

        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(PERIODIC_WORK, ExistingPeriodicWorkPolicy.KEEP, request);
    }

    /**
     * Drains as soon as the network allows. `KEEP` on the unique name, not
     * `REPLACE`: a page that signals while a drain is already running (or waiting
     * for the network) has nothing to add — that drain will see the same queue —
     * while cancelling it mid-replay is the one thing that must not happen.
     */
    static void flushSoon(Context context) {
        OneTimeWorkRequest request = new OneTimeWorkRequest.Builder(SyncFlushWorker.class)
            .setConstraints(networkConstraints())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_SECONDS, TimeUnit.SECONDS)
            .addTag(TAG)
            .build();

        WorkManager.getInstance(context)
            .enqueueUniqueWork(ON_DEMAND_WORK, ExistingWorkPolicy.KEEP, request);
    }

    private static Constraints networkConstraints() {
        return new Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build();
    }
}
