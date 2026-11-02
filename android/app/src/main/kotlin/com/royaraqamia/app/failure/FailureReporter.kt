package com.royaraqamia.app.failure

import android.app.ActivityManager
import android.content.Context
import android.os.Build
import android.os.Process
import android.util.Log
import com.royaraqamia.app.BuildConfig
import com.royaraqamia.app.contracts.generated.AppFailureReport
import java.io.File
import kotlin.system.exitProcess

/**
 * The app's own reports (#667): installs the process-wide crash handler, reads
 * the deaths the handler cannot see, and queues what the drain worker sends.
 *
 * Why this exists at all: the web client fails loudly. A broken page has a
 * console, a Sentry SDK, a network tab and a person who can open the site. An
 * APK has none of those, so a crash on a phone nobody is looking at leaves a
 * `Log.e` in a ring buffer that the next launch overwrites — the failure exists
 * only as a support message that says "the app closes".
 *
 * Three rules, in the order they matter:
 *
 * 1. **Never make a crash worse.** Every path here swallows its own failure: a
 *    disk that refuses, a queue that cannot be created and a handler that throws
 *    all end with the previous handler running as it always would.
 * 2. **Write before dying.** The report is a file, written synchronously in the
 *    handler; the network is somebody else's problem ([FailureDelivery]).
 * 3. **A launch pays almost nothing.** The handler is one field assignment; the
 *    exit history is a binder read that runs off the main thread
 *    ([RoyApplication]), because the cold-start budget is 550 ms on the reference
 *    phone (`docs/mobile/native-app.md`).
 */
object FailureReporter {
    /** What `adb logcat -s` reads these reports under. */
    const val TAG = "RoyFailure"

    /** The one preference this feature owns: how far the exit history was read. */
    const val PREFS = "royaraqamia_failures"
    const val EXIT_WATERMARK = "exit_watermark"

    /** How many of the platform's remembered deaths are examined per launch. */
    private const val EXIT_HISTORY = 10

    @Volatile private var installed = false

    /**
     * Take over the process's uncaught-exception handler, once.
     *
     * The previous handler is called exactly once and afterwards, so the
     * platform's own behaviour — the "app has stopped" flow, the ANR watchdog's
     * bookkeeping, a debugger's — is unchanged. The report is written first only
     * because the process will not exist after the call returns.
     */
    fun install(context: Context) {
        if (installed) return
        installed = true

        val app = context.applicationContext
        val previous = Thread.getDefaultUncaughtExceptionHandler()
        Thread.setDefaultUncaughtExceptionHandler { thread, error ->
            try {
                record(app, FailureReportFactory.crash(error, shellIdentity()))
            } catch (_: Throwable) {
                Log.w(TAG, "could not queue the crash")
            }

            if (previous != null) {
                previous.uncaughtException(thread, error)
            } else {
                // Nothing was listening; the process still has to end, and this is
                // how the platform's default handler would have ended it.
                Process.killProcess(Process.myPid())
                exitProcess(10)
            }
        }
    }

    /** A crash, an ANR and a failed drain all arrive here. */
    fun record(context: Context, report: AppFailureReport) {
        val app = context.applicationContext
        val queued = FailureDelivery.queue(app).add(report)
        if (!queued) {
            Log.w(TAG, "the failure queue refused a ${report.kind.name.lowercase()} report")
            return
        }

        // The log line says only what the report says: a class, a release and a
        // contract generation. It is a convenience for a plugged-in phone, not a
        // second, richer copy of the report.
        Log.w(
            TAG,
            "queued ${report.kind.name.lowercase()}/${report.reason.name.lowercase()} " +
                "from ${report.shell.name}+${report.shell.code} contracts@${report.contracts}",
        )
        FailureDelivery.deliverSoon(app)
    }

    /**
     * The deaths the handler never saw: ANRs, and native crashes. API 30 added
     * the history this reads; below it the app reports only what it caught
     * ([ExitHistory] says why `REASON_CRASH` is not one of them).
     */
    fun recordExitHistory(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) return

        val app = context.applicationContext
        val manager = app.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager ?: return
        val exits =
            try {
                manager
                    .getHistoricalProcessExitReasons(null, 0, EXIT_HISTORY)
                    .mapNotNull { info ->
                        ExitHistory.reasonOf(info.reason)?.let { reason ->
                            ProcessExit(info.timestamp, reason)
                        }
                    }
            } catch (_: Throwable) {
                return
            }

        val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val watermark = prefs.getLong(EXIT_WATERMARK, 0L)
        val fresh = ExitHistory.fresh(exits, watermark)

        // Move the watermark before writing, so a failure mid-way costs a report
        // and not a duplicate of the same one on every launch.
        val next = ExitHistory.watermarkAfter(exits, watermark)
        if (next != watermark) prefs.edit().putLong(EXIT_WATERMARK, next).apply()

        for (exit in fresh) {
            val report =
                when (exit.reason) {
                    ExitReason.ANR -> FailureReportFactory.anr(shellIdentity(), exit.timestamp)
                    ExitReason.NATIVE_CRASH ->
                        FailureReportFactory.nativeCrash(shellIdentity(), exit.timestamp)
                }
            record(app, report)
        }
    }

    /**
     * A drain that ended owing work, as a reason class and two counts. The
     * caller decides whether the drain has a reason at all ([DrainFailure]).
     */
    fun recordDrain(context: Context, reason: DrainFailureReason, pending: Int, failed: Int) {
        record(
            context.applicationContext,
            FailureReportFactory.drain(
                reason = reason,
                pending = pending,
                failed = failed,
                shell = shellIdentity(),
            ),
        )
    }

    /** The two numbers that attribute a report to an APK the update channel can compare. */
    fun shellIdentity(): ShellIdentity =
        ShellIdentity(name = BuildConfig.VERSION_NAME, code = BuildConfig.VERSION_CODE)

    /** Where the queue lives, for a drill that reads it back from a device. */
    fun queueDirectory(context: Context): File =
        File(context.applicationContext.filesDir, FailureQueue.DIRECTORY)
}
