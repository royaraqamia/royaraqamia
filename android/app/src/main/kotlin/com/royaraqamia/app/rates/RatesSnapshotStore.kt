package com.royaraqamia.app.rates

import java.io.File

/**
 * The last board the app managed to read (#658).
 *
 * The surface matrix promises a *snapshot* for `/rates`: the page the worker
 * caches keeps painting the last numbers it had, so the app must not be the client
 * that says "nothing to show" where the browser shows yesterday's board. This is
 * that promise kept on this side: one file, written only after a read the server
 * answered, and read only when a read failed.
 *
 * The body is the JSON the route sent, stored rather than the decoded object: a
 * file that no longer matches the generated contract has to *fail* decoding (and so
 * be answered as "nothing to show") instead of being pulled field by field into a
 * half-board. Writing goes through a temporary file and a rename, so a process
 * killed mid-write leaves the previous snapshot rather than a truncated one.
 *
 * It is not keyed by identity, because the board is public: two accounts on one
 * device read the same numbers, and signing out should not empty it.
 */
class RatesSnapshotStore(private val directory: File) {
    private val file = File(directory, FILE_NAME)

    /** Keeps [body] as the last snapshot. A failure to write is not a failure to read. */
    fun save(body: String) {
        runCatching {
            directory.mkdirs()
            val temporary = File(directory, "$FILE_NAME.tmp")
            temporary.writeText(body)
            if (!temporary.renameTo(file)) {
                // Windows refuses a rename over an existing file in some states;
                // deleting first keeps the snapshot current rather than stale.
                file.delete()
                temporary.renameTo(file)
            }
        }
    }

    /** The last snapshot's body, or null when there is none. */
    fun read(): String? = runCatching { if (file.isFile) file.readText() else null }.getOrNull()

    /** Drops the snapshot: what a signed-out device owes nobody. */
    fun clear() {
        runCatching { file.delete() }
    }

    companion object {
        const val FILE_NAME = "rates-board.json"
    }
}
