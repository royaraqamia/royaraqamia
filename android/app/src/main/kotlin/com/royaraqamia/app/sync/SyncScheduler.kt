package com.royaraqamia.app.sync

import android.content.Context
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.PeriodicWorkRequest
import androidx.work.WorkManager
import androidx.work.workDataOf
import java.util.concurrent.TimeUnit

/**
 * When the app delivers a queued write (#651), and with what constraints.
 *
 * Two schedules, and the split is the design ADR-0059 wrote for the shell:
 *
 * - **On demand**, from a silent push ([com.royaraqamia.app.SyncMessagingService])
 *   or from the document's own signal
 *   ([com.royaraqamia.app.ShellSyncBridge]): a wake is the moment another device
 *   says the account moved, and the moment to replay what this one still owes.
 * - **Every 15 minutes**, as the floor: WorkManager's shortest period, deferred
 *   further by doze. It is what recovers the cases the wake cannot cover — a
 *   message that never arrived, a device that was off, a schedule that gave up
 *   after its attempts.
 *
 * Both are constrained to a connected network. A drain that wakes with no
 * network would do nothing but spend an attempt, and WorkManager's answer to an
 * unsatisfied constraint is to wait for the connection, which is exactly the
 * moment the queue should move. The retry backoff starts at 30 s and doubles, so
 * [DrainDecision.MAX_ATTEMPTS] attempts span a tunnel rather than an afternoon.
 */
object SyncScheduler {

    /** The drain's own tag, so `adb shell dumpsys jobscheduler` reads legibly. */
    const val TAG = "royaraqamia-outbox"

    /** Unique work names. One on-demand drain and one floor, ever. */
    const val ON_DEMAND_WORK = "royaraqamia-drain-now"
    const val PERIODIC_WORK = "royaraqamia-drain-periodic"

    /**
     * The shell's names for the same two jobs. They are cancelled once per
     * launch because their work requests name `SyncFlushWorker`, a class this
     * APK no longer contains: left alone, the periodic one would keep waking to
     * a missing class every quarter of an hour, and the one-time one would hold
     * the on-demand slot (`KEEP`) while it failed.
     */
    private const val LEGACY_ON_DEMAND_WORK = "royaraqamia-outbox-now"
    private const val LEGACY_PERIODIC_WORK = "royaraqamia-outbox-periodic"

    const val PERIOD_MINUTES = 15L

    /** WorkManager's floor for a retry; it grows from here, exponentially. */
    const val BACKOFF_SECONDS = 30L

    /**
     * The 15-minute floor. `KEEP` rather than `REPLACE`: this runs on every
     * launch, and replacing the request would reset the period and the next
     * run's clock on every cold start.
     */
    @JvmStatic
    fun ensurePeriodic(context: Context) {
        WorkManager.getInstance(context).cancelUniqueWork(LEGACY_PERIODIC_WORK)
        WorkManager.getInstance(context).cancelUniqueWork(LEGACY_ON_DEMAND_WORK)

        val request =
            PeriodicWorkRequest.Builder(OutboxDrainWorker::class.java, PERIOD_MINUTES, TimeUnit.MINUTES)
                .setConstraints(networkConstraints())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_SECONDS, TimeUnit.SECONDS)
                .addTag(TAG)
                .build()

        WorkManager.getInstance(context)
            .enqueueUniquePeriodicWork(PERIODIC_WORK, ExistingPeriodicWorkPolicy.KEEP, request)
    }

    /**
     * Drains as soon as the network allows. `KEEP` on the unique name, not
     * `REPLACE`: a wake that arrives while a drain is already running (or
     * waiting for the network) has nothing to add — that drain will see the same
     * queue — while cancelling it mid-replay is the one thing that must not
     * happen.
     */
    @JvmStatic
    fun flushSoon(context: Context) {
        val request =
            OneTimeWorkRequest.Builder(OutboxDrainWorker::class.java)
                .setConstraints(networkConstraints())
                .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_SECONDS, TimeUnit.SECONDS)
                // A wake is the account saying it moved elsewhere, so this run
                // pulls as well as drains (ADR-0060). The floor does not: it is
                // this device's own queue, and asking only about that is what
                // keeps it from refreshing a token every quarter of an hour.
                .setInputData(workDataOf(OutboxDrainWorker.KEY_WAKE to true))
                .addTag(TAG)
                .build()

        WorkManager.getInstance(context)
            .enqueueUniqueWork(ON_DEMAND_WORK, ExistingWorkPolicy.KEEP, request)
    }

    private fun networkConstraints(): Constraints =
        Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()
}
