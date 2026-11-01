package com.royaraqamia.app.sync

import android.content.Context
import android.util.Log
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.royaraqamia.app.AppGraph
import com.royaraqamia.app.BuildConfig
import com.royaraqamia.app.ShellBatteryPrompt
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.store.habitflow.DrainReport

/**
 * Delivers a queued write with the app not in front (#651).
 *
 * This is the app's drain, not the shell's: the queue it replays is the Local
 * Store's Outbox (`HabitflowRepository.drain`), so a habit toggled with no radio
 * reaches the server after a kill, a reboot or a night of doze without the user
 * opening anything. Nothing here builds a WebView — the shell used to load
 * `/sync-flush.html` in a headless one, and that page is now only the installed
 * base's (ADR-0059, retired in the app by #651).
 *
 * Four rules, each one the answer to a failure:
 *
 * 1. **No network unless something is owed.** The queue is read first, from the
 *    database and the remembered identity ([AppGraph.start] is not called), so a
 *    15-minute floor on an empty queue costs a file read rather than a refresh
 *    token — a rotation every quarter of an hour would be a bug in its own
 *    right (Session's second rule).
 * 2. **A push wakes the drain; it never carries work.** The wake is a hint
 *    (ADR-0060): the worker reads what this device owes from its own store and
 *    replays it through the same endpoints the screen drains to, so the server
 *    keeps one implementation of the queue's rules.
 * 3. **Giving up does not drop the write.** [DrainDecision] ends this schedule
 *    after its attempt budget; the rows stay in the store and the floor re-arms
 *    the schedule. Only an accepted intent is removed, and the drainer is the
 *    only thing that removes one.
 * 4. **Work that is still owed is the reason to ask for the exemption.** The
 *    prompt follows the decision, not the launch, exactly where ADR-0059's
 *    amendment put it.
 */
class OutboxDrainWorker(context: Context, params: WorkerParameters) :
    CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        // One graph for the run, released in `finally`: a worker that left a
        // database open would keep a connection per process start.
        val graph =
            AppGraph.create(
                context = applicationContext,
                siteUrl = BuildConfig.SITE_URL,
                authUrl = BuildConfig.SUPABASE_AUTH_URL,
                anonKey = BuildConfig.SUPABASE_ANON_KEY,
            )

        return try {
            deliver(graph)
        } finally {
            graph.close()
        }
    }

    private suspend fun deliver(graph: AppGraph): Result {
        val owed = graph.habitflow.outboxStatus()
        // A wake is also the account saying it moved elsewhere (ADR-0060), so it
        // is worth a pull even when this device owes nothing. The floor is not:
        // it asks only about what this device still has to deliver, so an empty
        // queue costs a file read and never a refresh token.
        val woken = inputData.getBoolean(KEY_WAKE, false)
        if (owed.pending == 0 && !woken) {
            Log.i(TAG, DrainDecision.of(owed, runAttemptCount).summary)
            return Result.success()
        }

        // The session is what a request is sent with, and every attempt to get
        // one costs a refresh — so it is asked for *after* the queue (or the
        // wake) said there is something to do. A refused refresh signs out
        // (Session's third rule); the intents stay under their account's
        // partition for the next sign-in to send (ADR-0027).
        if (!graph.start()) {
            val decision =
                DrainDecision.of(owed, runAttemptCount, why = "no session to send with")
            Log.i(TAG, decision.summary)
            return result(decision)
        }

        val report: DrainReport = graph.drainOutbox()
        val decision = DrainDecision.of(report, runAttemptCount)
        Log.i(TAG, decision.summary)

        // A pull after the drain, never before: the queue is this device's news,
        // and reading the server's copy first would mean merging over it. It is
        // best-effort — the write is what the schedule exists for, and a pull
        // that failed is a screen that pulls when it opens.
        if (woken) pull(graph)
        return result(decision)
    }

    /** The wake's other half (ADR-0060), with its failure kept out of the decision. */
    private suspend fun pull(graph: AppGraph) {
        when (val pulled = graph.habitflow.pull()) {
            is ApiResult.Success -> Log.i(TAG, "pulled ${pulled.value} row(s)")
            is ApiResult.Failure -> Log.i(TAG, "the pull was not answered: ${pulled.error}")
        }
    }

    /**
     * The decision as WorkManager understands it, with the exemption prompt on
     * the one path that has work left: a wake in the background and a drain that
     * ends owing something are the two moments ADR-0059 chose, and both reach
     * [ShellBatteryPrompt] here.
     */
    private fun result(decision: DrainDecision): Result {
        if (decision.outcome == DrainOutcome.Drained) return Result.success()
        ShellBatteryPrompt.promptIfNeeded(applicationContext)
        return when (decision.outcome) {
            DrainOutcome.Retry -> Result.retry()
            DrainOutcome.Abandoned -> Result.failure()
            DrainOutcome.Drained -> Result.success()
        }
    }

    companion object {
        /**
         * What `adb logcat -s` reads the drain under. The shell's
         * `RoySyncFlush` tag went with the headless page it described.
         */
        const val TAG = "RoyOutboxDrain"

        /**
         * Set by [SyncScheduler.flushSoon]: this run was asked for by a push, so
         * it also pulls. The floor never sets it.
         */
        const val KEY_WAKE = "wake"
    }
}
