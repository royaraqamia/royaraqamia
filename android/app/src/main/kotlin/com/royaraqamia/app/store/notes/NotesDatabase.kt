package com.royaraqamia.app.store.notes

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import androidx.room.Transaction
import androidx.room.Upsert
import com.royaraqamia.app.store.Identity
import com.royaraqamia.app.store.localStoreName
import com.royaraqamia.app.store.outbox.OutboxIntentRow

/**
 * Notes' Local Store (#1390): the rows the list paints from, the cursor the pull
 * resumes from, and the queue of writes the device has not delivered yet.
 *
 * One database per identity, named the way the web names its IndexedDB database
 * (ADR-0027, ADR-0107): `<product>__<identity>`. The partition is the filename,
 * so a store opened for one account cannot return another account's row — there
 * is no `user_id` column to filter on and nothing to get wrong in a query. The
 * Outbox and the cursor live in the same file, which is what makes a queued write
 * belong to the identity that made it.
 *
 * `clientId` is the primary key because the web's store keys notes on it (the id
 * the client mints, which the server accepts as its own). A tombstone is a row
 * with `deletedAt` set, kept rather than removed: the sync route is
 * tombstone-inclusive, so a delete made on another device arrives as a row and a
 * pull that dropped it would re-create the note.
 */
@Database(
    entities = [NoteRow::class, OutboxIntentRow::class, NoteMetaRow::class],
    version = 1,
    exportSchema = true,
)
abstract class NotesDatabase : RoomDatabase() {
    abstract fun notes(): NoteDao

    companion object {
        /** The product's name in every store it has. */
        const val PRODUCT = "notes"

        /**
         * The file this identity's rows live in: `notes__guest.db`,
         * `notes__user%3A<id>.db`. The colon is percent-encoded because the name
         * is opened, never parsed.
         */
        fun fileName(identity: Identity): String =
            "${localStoreName(PRODUCT, identity).replace(":", "%3A")}.db"
    }
}

/**
 * One note as the store holds it.
 *
 * The record is camelCase on both sides because the device's copy is the source
 * of truth: `updatedAt` is the last-write-wins stamp (ADR-0029), `deletedAt` the
 * tombstone an undo clears, and `clientId` is the id the row is keyed on
 * everywhere. The body is Markdown, the same text the page stores; the list
 * renders its plain-text projection and never parses it as HTML.
 */
@Entity(tableName = "notes")
data class NoteRow(
    @PrimaryKey val clientId: String,
    val id: String,
    val body: String,
    val createdAt: String,
    val updatedAt: String,
    val deletedAt: String?,
)

/** The pull's cursor: the newest `server_updated_at` this device has applied. */
@Entity(tableName = "meta")
data class NoteMetaRow(
    @PrimaryKey val key: String,
    val value: String,
)

@Dao
interface NoteDao {
    /**
     * The list the surface paints: live rows, newest edit first, the order the
     * web's store sorts into.
     */
    @Query("SELECT * FROM notes WHERE deletedAt IS NULL ORDER BY updatedAt DESC, clientId DESC")
    suspend fun notes(): List<NoteRow>

    /** Every stored note, tombstones included: the merge's local side. */
    @Query("SELECT * FROM notes")
    suspend fun allNotes(): List<NoteRow>

    @Query("SELECT * FROM notes WHERE clientId = :clientId")
    suspend fun note(clientId: String): NoteRow?

    @Query("SELECT COUNT(*) FROM notes")
    suspend fun count(): Int

    @Query("SELECT * FROM meta WHERE key = :key")
    suspend fun meta(key: String): NoteMetaRow?

    @Upsert
    suspend fun upsertNotes(rows: List<NoteRow>)

    @Upsert
    suspend fun upsertNote(row: NoteRow)

    @Upsert
    suspend fun upsertMeta(row: NoteMetaRow)

    /**
     * One pull, one transaction: a process killed halfway through writes either
     * the whole snapshot or none of it, so the next launch paints a list and never
     * a half-list. Upsert by key is what makes a pull idempotent.
     */
    @Transaction
    suspend fun apply(rows: List<NoteRow>, cursor: String?) {
        upsertNotes(rows)
        if (cursor != null) upsertMeta(NoteMetaRow(CURSOR_KEY, cursor))
    }

    /**
     * A write and its replay intent, committed together (#650): an intent can
     * never describe a row that is not on disk, and a row can never be written
     * without the intent that will send it. Either both persist or neither does.
     */
    @Transaction
    suspend fun commit(note: NoteRow, intent: OutboxIntentRow) {
        upsertNote(note)
        insertIntent(intent)
    }

    // --- Outbox ---------------------------------------------------------------

    /** Every intent, in strict replay order: the order the writes were made. */
    @Query("SELECT * FROM outbox ORDER BY seq ASC")
    suspend fun outbox(): List<OutboxIntentRow>

    @Query("SELECT COUNT(*) FROM outbox WHERE status = :status")
    suspend fun countIntents(status: String): Int

    @Insert
    suspend fun insertIntent(intent: OutboxIntentRow): Long

    @Query("DELETE FROM outbox WHERE seq = :seq")
    suspend fun deleteIntent(seq: Long)

    @Query(
        "UPDATE outbox SET attempts = :attempts, status = :status, " +
            "lastError = :lastError, nextAttemptAt = :nextAttemptAt WHERE seq = :seq"
    )
    suspend fun patchIntent(
        seq: Long,
        attempts: Int,
        status: String,
        lastError: String?,
        nextAttemptAt: Long,
    )

    /** A manual retry: every permanently failed intent is due again. */
    @Query(
        "UPDATE outbox SET status = 'pending', attempts = 0, lastError = NULL, " +
            "nextAttemptAt = 0 WHERE status = 'failed'"
    )
    suspend fun retryFailedIntents()

    companion object {
        const val CURSOR_KEY = "syncCursor"
    }
}
