package com.royaraqamia.app.community

import java.io.File

/**
 * The feed as this device last painted it (#658).
 *
 * The surface matrix promises a *snapshot* for `/community`: the page the worker
 * caches keeps painting its last rows with the radio off, so the app must not be
 * the client that answers "nothing to show" where the browser shows the feed it
 * saw yesterday. This is that promise kept on this side: one file, written only
 * after a read the server answered (and after each page a member loaded), read
 * only when a read failed.
 *
 * The body is the JSON the contract type encodes, not a second shape invented
 * here: a file that no longer matches the generated type has to *fail* decoding
 * — and so be answered "nothing to show" — instead of being pulled field by
 * field into half a feed. Writing goes through a temporary file and a rename, so
 * a process killed mid-write leaves the previous snapshot rather than a
 * truncated one.
 *
 * It is not keyed by identity, because the feed is public: two accounts on one
 * device read the same rows, and signing out should not empty it.
 */
class CommunityFeedSnapshotStore(private val directory: File) {
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

    /** Drops the snapshot. */
    fun clear() {
        runCatching { file.delete() }
    }

    companion object {
        const val FILE_NAME = "community-feed.json"
    }
}
