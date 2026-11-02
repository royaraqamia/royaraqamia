package com.royaraqamia.app.failure

import com.royaraqamia.app.contracts.generated.AppFailureReport
import com.royaraqamia.app.contracts.generated.AppFailureReportKind
import com.royaraqamia.app.contracts.generated.AppFailureReportReason
import com.royaraqamia.app.contracts.generated.AppFailureReportShell
import com.royaraqamia.app.contracts.generated.ContractGeneration

/** The APK a report came from: what the update channel compares, and what a person reads. */
data class ShellIdentity(val name: String, val code: Int)

/**
 * Builds the three reports the app can file (#667), and is the only place that
 * decides what may travel inside one.
 *
 * The narrowness is the design, not caution. A native client has no console and
 * no page to inspect, so a report is the only trace a failure leaves — which is
 * exactly why it may not become a copy of everything the process knew:
 *
 * - **A crash carries frames and a class name, never a message.** A `Throwable`'s
 *   message is written by whatever threw it and can hold a URL with its query
 *   string, a row's contents or a token echoed back by a server. The class name
 *   (`java.lang.IllegalStateException`) groups issues and names nothing private.
 * - **A frame is `class.method(file:line)` or it is dropped.** The format's own
 *   characters exclude a space (a sentence) and a `?` (a query string), and the
 *   filter below drops the words a credential would arrive under.
 * - **A drain carries two counts and a reason class.** No row, no endpoint, no
 *   payload: the queue holds the writes, and Sentry does not need them to say
 *   that delivery is failing.
 * - **The release is the shell's version and the contract generation**, so a
 *   report is attributable to an APK even after the site has moved on.
 */
object FailureReportFactory {
    /** How much of the stack is worth sending: the top is the crash, the rest is noise. */
    const val MAX_FRAMES = 16

    /** The contract's own cap on one frame (`shared/contracts/app-failures.ts`). */
    const val MAX_FRAME_CHARS = 160

    /** The contract's own cap on a signature. */
    const val MAX_SIGNATURE_CHARS = 80

    /**
     * What a frame may not contain. The schema already refuses a `?` and a space,
     * so this is the belt to that braces: a credential's *name* is refused here,
     * before the frame is ever formatted into a report.
     */
    private val FORBIDDEN =
        Regex(
            "(?i)(bearer|access[_-]?token|refresh[_-]?token|apikey|api[_-]?key|" +
                "secret|password|cookie|authorization|\\?\\S)"
        )

    /** The frame format the contract's pattern allows, character for character. */
    private val FRAME = Regex("^[A-Za-z0-9._$<>\\[\\]():/-]{1,$MAX_FRAME_CHARS}$")

    fun crash(
        error: Throwable,
        shell: ShellIdentity,
        at: Long = System.currentTimeMillis(),
    ): AppFailureReport =
        AppFailureReport(
            version = VERSION,
            kind = AppFailureReportKind.CRASH,
            reason = AppFailureReportReason.UNCAUGHT,
            signature = signatureOf(error),
            shell = shellOf(shell),
            contracts = ContractGeneration.STAMP,
            frames = framesOf(error).takeIf { it.isNotEmpty() },
            at = at,
        )

    /**
     * A native death, seen by the exit history rather than by the handler — the
     * JVM's handler never runs for a tombstone.
     */
    fun nativeCrash(
        shell: ShellIdentity,
        at: Long,
    ): AppFailureReport =
        AppFailureReport(
            version = VERSION,
            kind = AppFailureReportKind.CRASH,
            reason = AppFailureReportReason.NATIVE,
            signature = "native",
            shell = shellOf(shell),
            contracts = ContractGeneration.STAMP,
            at = at,
        )

    /** An ANR: the process was killed for not answering, and nothing was thrown. */
    fun anr(
        shell: ShellIdentity,
        at: Long,
    ): AppFailureReport =
        AppFailureReport(
            version = VERSION,
            kind = AppFailureReportKind.ANR,
            reason = AppFailureReportReason.ANR,
            signature = "anr",
            shell = shellOf(shell),
            contracts = ContractGeneration.STAMP,
            at = at,
        )

    /** A drain that ended owing work: a reason class and two counts, nothing else. */
    fun drain(
        reason: DrainFailureReason,
        pending: Int,
        failed: Int,
        shell: ShellIdentity,
        at: Long = System.currentTimeMillis(),
    ): AppFailureReport =
        AppFailureReport(
            version = VERSION,
            kind = AppFailureReportKind.DRAIN,
            reason = reason.reason,
            signature = "drain",
            shell = shellOf(shell),
            contracts = ContractGeneration.STAMP,
            pending = pending.toLong(),
            failed = failed.toLong(),
            at = at,
        )

    /**
     * The frames worth sending: formatted, filtered, and capped.
     *
     * A frame with no file name (`Unknown Source` on a synthetic) is dropped
     * rather than filled with a placeholder, because the placeholder would be a
     * sentence in a field the contract keeps machine-shaped.
     */
    fun framesOf(error: Throwable): List<String> =
        error.stackTrace
            .asSequence()
            .mapNotNull { frameOf(it) }
            .filter { !FORBIDDEN.containsMatchIn(it) }
            .filter { FRAME.matches(it) }
            .take(MAX_FRAMES)
            .toList()

    private fun frameOf(element: StackTraceElement): String? {
        val file = element.fileName ?: return null
        if (element.lineNumber < 0) return null
        if (element.className.isEmpty() || element.methodName.isEmpty()) return null
        return "${element.className}.${element.methodName}($file:${element.lineNumber})"
    }

    /**
     * The exception's class, never its message.
     *
     * Sanitised to the contract's own signature pattern rather than trusted: a
     * class name is machine-shaped in every case we have seen, and the one case
     * nobody predicted must not cost the whole report to a `400` on a field that
     * only exists to group issues.
     */
    private fun signatureOf(error: Throwable): String {
        val raw = error.javaClass.name
        val safe = raw.map { character -> if (SIGNATURE_CHARS.contains(character)) character else '_' }
        val name = safe.joinToString("")
        val anchored = if (name.isEmpty() || name[0].isDigit()) "_$name" else name
        return if (anchored.length > MAX_SIGNATURE_CHARS) anchored.take(MAX_SIGNATURE_CHARS) else anchored
    }

    /** The contract's signature alphabet: `[A-Za-z0-9._$<>[\]]`, minus the first-character rule. */
    private const val SIGNATURE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789._$<>[]"

    private fun shellOf(shell: ShellIdentity) =
        AppFailureReportShell(name = shell.name, code = shell.code.toLong())

    /** `z.literal(1)` reaches Kotlin as a `Double`; the wire value is still `1`. */
    private const val VERSION = 1.0
}
