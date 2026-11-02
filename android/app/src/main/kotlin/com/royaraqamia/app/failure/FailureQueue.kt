package com.royaraqamia.app.failure

import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.contracts.generated.AppFailureReport
import java.io.File

/**
 * The reports waiting to be sent, as files on disk (#667).
 *
 * A crash cannot wait for a network: the process is dying in the handler's next
 * step, so the report has to be durable before the handler returns. A file is the
 * smallest thing that survives that — no database to open, no transaction to
 * commit, nothing that can block on a lock the crashing thread held.
 *
 * Three bounds keep a broken build from filling the disk or the issue stream:
 * [MAX_STORED] reports, [MAX_AGE_MS] of history, and a queue that never throws —
 * a failure to queue a failure must not become the crash the app dies of.
 */
class FailureQueue(
    private val directory: File,
    private val limit: Int = MAX_STORED,
    private val maxAgeMs: Long = MAX_AGE_MS,
    private val now: () -> Long = System::currentTimeMillis,
) {
    /** One report, as it will be posted: the body is the file's own text. */
    data class Pending(val file: File, val body: String)

    /** Walk the queue oldest first, dropping what cannot be read. */
    fun pending(): List<Pending> {
        // Trim before reading: a queue nobody wrote to for a fortnight would
        // otherwise keep its expired reports until the next failure added one.
        prune()
        return files().mapNotNull { file ->
            val body =
                try {
                    file.readText()
                } catch (_: Throwable) {
                    remove(file)
                    return@mapNotNull null
                }
            if (body.isBlank()) {
                remove(file)
                null
            } else {
                Pending(file, body)
            }
        }
    }

    /**
     * Write a report and trim the queue. Answers whether it was written: a disk
     * that refuses is worth a log line, not an exception on the crash path.
     */
    fun add(report: AppFailureReport): Boolean {
        val body =
            try {
                ContractCodec.encode(report)
            } catch (_: Throwable) {
                return false
            }

        val file = File(directory, nameFor(report))
        return try {
            directory.mkdirs()
            // Write beside the target and rename, so a crash mid-write leaves no
            // half a JSON file that would be posted as a body the server refuses.
            val partial = File(directory, "${file.name}.part")
            partial.writeText(body)
            if (!partial.renameTo(file)) {
                file.writeText(body)
                partial.delete()
            }
            prune()
            true
        } catch (_: Throwable) {
            false
        }
    }

    fun remove(file: File) {
        try {
            file.delete()
        } catch (_: Throwable) {
            // A file that cannot be deleted stays and is retried next time.
        }
    }

    /** Drop the oldest beyond [limit], and anything older than [maxAgeMs]. */
    fun prune() {
        val files = files()
        val cutoff = now() - maxAgeMs
        files.forEach { file -> if (timestampOf(file) < cutoff) remove(file) }

        val kept = files.filter { file -> file.exists() }
        if (kept.size <= limit) return
        kept.dropLast(limit).forEach { file -> remove(file) }
    }

    private fun files(): List<File> =
        try {
            directory
                .listFiles { file -> file.isFile && file.name.endsWith(SUFFIX) }
                ?.sortedBy { it.name }
                ?: emptyList()
        } catch (_: Throwable) {
            emptyList()
        }

    /** The name's own prefix is the clock, so the queue's order is the event's order. */
    private fun timestampOf(file: File): Long =
        file.name.substringBefore('-').toLongOrNull() ?: file.lastModified()

    private fun nameFor(report: AppFailureReport): String =
        // `Locale.ROOT` is not a preference: the default locale would write
        // Arabic-Indic digits into a filename the queue sorts by.
        String.format(
            java.util.Locale.ROOT,
            "%013d-%s$SUFFIX",
            now(),
            report.kind.name.lowercase(java.util.Locale.ROOT),
        )

    companion object {
        /** Where the queue lives under `filesDir`; also what a drill reads on a device. */
        const val DIRECTORY = "app-failures"

        /** Twenty reports is several bad nights; beyond that the oldest is not news. */
        const val MAX_STORED = 20

        /** A report older than this describes a build nobody runs any more. */
        const val MAX_AGE_MS: Long = 14L * 24 * 60 * 60 * 1000

        const val SUFFIX = ".json"
    }
}
