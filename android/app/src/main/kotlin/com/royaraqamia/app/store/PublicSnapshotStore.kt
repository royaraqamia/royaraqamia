package com.royaraqamia.app.store

import java.io.File

/**
 * The last rows a public surface painted, kept on this device (#928, #658).
 *
 * The rule is in `docs/specs/offline-first.md` ("A public surface shows its
 * last-seen rows, read-only"): a feed, the rates board, a digest, a certificate
 * and a profile are the same rows for everyone, so a device that saw them keeps
 * them and paints them with the radio off, under the surface's own stale line.
 * This is that rule's storage on the Android side, one implementation rather
 * than a store per screen.
 *
 * One directory, one file per surface key, so two surfaces cannot overwrite each
 * other and a surface only ever reads what it wrote. The key is part of the
 * interface: a caller names its surface (`community`, `rates`, ...) on every
 * read and write, and a key that is not a plain surface id is refused rather
 * than silently mapped onto another file.
 *
 * The body is the JSON the surface's generated contract encodes, not a second
 * shape invented here: a file that no longer matches the type has to *fail*
 * decoding — and so be answered "nothing to show" — rather than being pulled
 * field by field into half a screen. Writing goes through a temporary file and
 * a rename, so a process killed mid-write leaves the previous snapshot rather
 * than a truncated one.
 *
 * It is not keyed by identity, because the rows are public: two accounts on one
 * device read the same rows, and signing out does not empty it. It is the app's
 * half of the web's `public:` scope
 * (`frontend/shared/local-store/snapshot.ts`).
 */
class PublicSnapshotStore(private val directory: File) {
    /** Keeps [body] as the last snapshot for [surface]. A failed write is not a failed read. */
    fun save(surface: String, body: String) {
        // The key is validated before the I/O: a typo is a bug in the caller,
        // not a device that cannot write.
        val file = fileFor(surface)
        runCatching {
            directory.mkdirs()
            val temporary = File(directory, "${file.name}.tmp")
            temporary.writeText(body)
            if (!temporary.renameTo(file)) {
                // Windows refuses a rename over an existing file in some states;
                // deleting first keeps the snapshot current rather than stale.
                file.delete()
                temporary.renameTo(file)
            }
        }
    }

    /** The last snapshot for [surface], or null when there is none. */
    fun read(surface: String): String? {
        val file = fileFor(surface)
        return runCatching { file.takeIf { it.isFile }?.readText() }.getOrNull()
    }

    /** Drops [surface]'s snapshot: what a signed-out device owes nobody. */
    fun clear(surface: String) {
        val file = fileFor(surface)
        runCatching { file.delete() }
    }

    private fun fileFor(surface: String): File {
        require(SURFACE_KEY.matches(surface)) {
            "a public snapshot key is a surface id (a-z, 0-9, -), not \"$surface\""
        }
        return File(directory, "$surface.json")
    }

    companion object {
        /**
         * The shape of a key. The surface ids in `perf/surfaces.json` use it, and
         * it cannot contain a separator, so one key can never name another key's
         * file.
         */
        private val SURFACE_KEY = Regex("[a-z0-9][a-z0-9-]*")
    }
}
