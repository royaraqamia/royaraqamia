package com.royaraqamia.app.failure

import android.content.Context
import android.util.Log
import androidx.work.BackoffPolicy
import androidx.work.Constraints
import androidx.work.CoroutineWorker
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequest
import androidx.work.PeriodicWorkRequest
import androidx.work.WorkManager
import androidx.work.WorkerParameters
import com.royaraqamia.app.BuildConfig
import com.royaraqamia.app.net.HttpTransport
import com.royaraqamia.app.net.Transport
import java.io.File
import java.io.IOException
import java.util.concurrent.TimeUnit

/** What one delivery pass did, so the worker knows whether to ask again. */
data class DeliveryOutcome(val sent: Int, val dropped: Int, val left: Int) {
    val done: Boolean get() = left == 0
}

/**
 * Delivers the failure queue (#667) — the half of the report that has to wait.
 *
 * A crash is queued on the device because the process is dying; the network is
 * whatever it is at that moment. So delivery is a work item with a
 * `CONNECTED` constraint: a crash while the radio is off is sent when one
 * returns, without the app being opened, because that is exactly the case a
 * person cannot be asked to reproduce.
 *
 * **No session is required, and none is spent.** This is the one request the app
 * sends without a bearer: the state it reports on is often the state that lost
 * the session, and a report that needed a refresh token to travel would be
 * silent precisely when the refresh is what broke. The route is public, rate
 * limited and bypasses the update floor for the same reason.
 *
 * **A report the server will never accept is dropped.** `400` means the app and
 * the contract disagree about the body; retrying it forever would block the
 * queue behind a bug and cost a wake every half hour. `429` and `5xx` are the
 * opposite — the body is fine — so the pass stops and the schedule retries.
 */
object FailureDelivery {
    /** The route the report is posted to; the same path the web beacons use. */
    const val PATH = "/api/app-failures"

    /** The work names, tag and backoff the app's background work already uses. */
    const val NOW_WORK = "royaraqamia-failures-now"
    const val PERIODIC_WORK = "royaraqamia-failures-periodic"
    const val WORK_TAG = "royaraqamia-failures"
    const val PERIOD_MINUTES = 6L * 60
    const val BACKOFF_SECONDS = 30L

    fun queue(context: Context): FailureQueue =
        FailureQueue(File(context.applicationContext.filesDir, FailureQueue.DIRECTORY))

    /** Send as soon as the radio allows; a duplicate call keeps the one already queued. */
    fun deliverSoon(context: Context) {
        try {
            val request =
                OneTimeWorkRequest.Builder(FailureDeliveryWorker::class.java)
                    .setConstraints(networkConstraints())
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_SECONDS, TimeUnit.SECONDS)
                    .addTag(WORK_TAG)
                    .build()
            WorkManager.getInstance(context.applicationContext)
                .enqueueUniqueWork(NOW_WORK, ExistingWorkPolicy.KEEP, request)
        } catch (error: RuntimeException) {
            // WorkManager unavailable (a process too broken to initialize): the
            // file is still on disk and the next launch asks again.
            Log.w(TAG, "could not arm the failure delivery")
        }
    }

    /**
     * The quiet floor: six hours, so a report queued while the app was killed
     * before WorkManager could be told still leaves the device.
     */
    fun ensurePeriodic(context: Context) {
        try {
            val request =
                PeriodicWorkRequest.Builder(
                        FailureDeliveryWorker::class.java,
                        PERIOD_MINUTES,
                        TimeUnit.MINUTES,
                    )
                    .setConstraints(networkConstraints())
                    .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, BACKOFF_SECONDS, TimeUnit.SECONDS)
                    .addTag(WORK_TAG)
                    .build()
            WorkManager.getInstance(context.applicationContext)
                .enqueueUniquePeriodicWork(
                    PERIODIC_WORK,
                    ExistingPeriodicWorkPolicy.KEEP,
                    request,
                )
        } catch (error: RuntimeException) {
            Log.w(TAG, "could not arm the failure floor")
        }
    }

    /**
     * One pass over the queue, oldest first.
     *
     * The body is the file's own text: it was serialized when the failure
     * happened, from the contract the APK carries, so a later code change cannot
     * rewrite what an earlier build decided to say.
     */
    fun drain(
        queue: FailureQueue,
        siteUrl: String,
        transport: Transport = HttpTransport,
    ): DeliveryOutcome {
        val url = "${siteUrl.trimEnd('/')}$PATH"
        var sent = 0
        var dropped = 0

        val pending = queue.pending()
        for (entry in pending) {
            val status =
                try {
                    transport
                        .send(
                            "POST",
                            url,
                            mapOf("Content-Type" to "application/json"),
                            entry.body,
                        )
                        .status
                } catch (_: IOException) {
                    // The radio went away mid-pass: everything left stays queued.
                    return DeliveryOutcome(sent, dropped, pending.size - sent - dropped)
                }

            when {
                status in 200..299 -> {
                    queue.remove(entry.file)
                    sent += 1
                }
                // 429 and 5xx are "not now"; 400-499 (except 429) is "never".
                status == 429 || status >= 500 -> {
                    return DeliveryOutcome(sent, dropped, pending.size - sent - dropped)
                }
                status >= 400 -> {
                    queue.remove(entry.file)
                    dropped += 1
                }
                else -> {
                    // A 3xx is a redirect the transport deliberately does not
                    // follow: treat it as "not now" rather than guessing.
                    return DeliveryOutcome(sent, dropped, pending.size - sent - dropped)
                }
            }
        }

        return DeliveryOutcome(sent, dropped, 0)
    }

    private fun networkConstraints(): Constraints =
        Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build()

    /** What `adb logcat -s` reads the queue under. */
    const val TAG = "RoyFailure"
}

/**
 * The work item itself: one drain of the queue, retried with backoff while the
 * queue still holds something the server did not answer for.
 */
class FailureDeliveryWorker(context: Context, params: WorkerParameters) :
    CoroutineWorker(context, params) {

    override suspend fun doWork(): Result {
        val outcome =
            try {
                FailureDelivery.drain(FailureDelivery.queue(applicationContext), BuildConfig.SITE_URL)
            } catch (error: RuntimeException) {
                Log.w(FailureDelivery.TAG, "the failure queue did not drain")
                return Result.retry()
            }

        if (outcome.sent > 0 || outcome.dropped > 0) {
            Log.i(
                FailureDelivery.TAG,
                "delivered ${outcome.sent} report(s), dropped ${outcome.dropped}, ${outcome.left} left",
            )
        }
        return if (outcome.done) Result.success() else Result.retry()
    }
}
