package com.royaraqamia.app.failure

import android.app.ApplicationExitInfo

/**
 * What the platform's process history can add to the app's own handler (#667).
 *
 * The uncaught-exception handler sees Java crashes and nothing else: an ANR is
 * the system killing a process that never threw, and a native crash never reaches
 * the JVM at all. `ActivityManager.getHistoricalProcessExitReasons` is the only
 * place both exist, so it is read once per launch — which is the only moment it
 * can be, the process that died is gone.
 *
 * `REASON_CRASH` is deliberately **not** mapped: the handler wrote its own report
 * for that death, and mapping it here would file every Java crash twice.
 */
enum class ExitReason { ANR, NATIVE_CRASH }

/** One process death the platform remembers, with the class it maps to. */
data class ProcessExit(val timestamp: Long, val reason: ExitReason)

object ExitHistory {
    /**
     * The platform's reason code as a class this app reports, or `null` for the
     * deaths it must not report (a Java crash the handler already filed, a user
     * force-stop, a low-memory kill, a normal exit).
     */
    fun reasonOf(code: Int): ExitReason? =
        when (code) {
            ApplicationExitInfo.REASON_ANR -> ExitReason.ANR
            ApplicationExitInfo.REASON_CRASH_NATIVE -> ExitReason.NATIVE_CRASH
            else -> null
        }

    /**
     * The deaths that happened after [watermark], oldest first.
     *
     * The watermark is what keeps a launch from re-filing a death it already
     * reported: the history is the platform's, not the app's, and it does not
     * shrink when the queue is drained.
     */
    fun fresh(exits: List<ProcessExit>, watermark: Long): List<ProcessExit> =
        exits.filter { it.timestamp > watermark }.sortedBy { it.timestamp }

    /** The watermark to store after a read: the newest death the app has seen. */
    fun watermarkAfter(exits: List<ProcessExit>, watermark: Long): Long =
        maxOf(watermark, exits.maxOfOrNull { it.timestamp } ?: watermark)
}
