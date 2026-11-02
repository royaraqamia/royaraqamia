package com.royaraqamia.app

import android.app.Application
import android.util.Log
import com.royaraqamia.app.failure.FailureDelivery
import com.royaraqamia.app.failure.FailureReporter

/**
 * The app's process entry point, and the only thing that has to happen before
 * an activity exists (#667).
 *
 * It is a `Application` subclass for one reason: a crash handler has to be
 * installed before the process can fail, including a process the launcher did
 * not start (a push wake, a WorkManager run). `ShellActivity` is too late for
 * either, and a content provider would be a hidden hook for a job the platform
 * already has a hook for.
 *
 * **The launch budget owns the shape of this class.** Installing the handler is
 * a field assignment; everything else — reading the platform's exit history,
 * arming the delivery work — buys the first frame nothing, so it runs on a
 * thread of its own. The cold budget on the reference phone is 550 ms
 * (`docs/mobile/native-app.md`), and a binder read on the launch path is exactly
 * the kind of millisecond that table counts.
 */
class RoyApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        FailureReporter.install(this)
        Thread(::armFailures, "roy-failures").start()
    }

    private fun armFailures() {
        try {
            FailureReporter.recordExitHistory(this)
            FailureDelivery.ensurePeriodic(this)
            // A report queued by the launch that just died is owed by this one.
            // The queue is read first, for the reason the outbox drain reads its
            // own: a process start with nothing to say should not enqueue work.
            if (FailureDelivery.queue(this).pending().isNotEmpty()) {
                FailureDelivery.deliverSoon(this)
            }
        } catch (_: Throwable) {
            Log.w(FailureReporter.TAG, "the failure queue did not arm")
        }
    }
}
