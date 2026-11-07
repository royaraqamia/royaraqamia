package com.royaraqamia.app.store.chats

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Index
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
 * Chats' Local Store (#1033, #1127): the list, the open thread's header, its
 * newest lines, and the queue of writes the device has not delivered yet.
 *
 * The tables mirror the web's `chats__<identity>` database (`frontend/api/chats/
 * local-store.ts`): `threads`, `headers`, `messages` and the shared outbox. A row
 * is the generated contract as JSON rather than a column per field, because the
 * shapes are nested (a header carries its roster) and a server that adds an
 * optional field must be readable, not a migration. `storedAt` is the local
 * clock the thirty-day sweep reads; `createdAt` stays the server's ordering key.
 *
 * One database per identity, named the way the web names its IndexedDB database
 * (`chats__<identity>`). The Outbox lives in the same file, which is what makes
 * a queued line belong to the account that wrote it.
 */
@Database(
    entities = [ChatThreadRow::class, ChatHeaderRow::class, ChatMessageRow::class, OutboxIntentRow::class],
    version = 1,
    exportSchema = true,
)
abstract class ChatsDatabase : RoomDatabase() {
    abstract fun chats(): ChatsDao

    companion object {
        /** The product's name in every store it has. */
        const val PRODUCT = "chats"

        /** The file this identity's rows live in: `chats__user%3A<id>.db`. */
        fun fileName(identity: Identity): String =
            "${localStoreName(PRODUCT, identity).replace(":", "%3A")}.db"
    }
}

/** One row of the Chats tab, as `ChatThreadsResponseThreadsItem` was decoded. */
@Entity(tableName = "threads")
data class ChatThreadRow(
    @PrimaryKey val id: String,
    val json: String,
    val lastMessageAt: String?,
    val createdAt: String,
    val storedAt: Long,
)

/** One open thread's header, as `ChatThreadResponseThread` was decoded. */
@Entity(tableName = "headers")
data class ChatHeaderRow(
    @PrimaryKey val id: String,
    val json: String,
    val storedAt: Long,
)

/**
 * One line. `id` is the server's id, or `local:<clientId>` while the line is
 * still in the outbox; `clientId` is what ties the two copies of one line
 * together (ADR-0029).
 */
@Entity(tableName = "messages", indices = [Index(value = ["conversationId", "createdAt"])])
data class ChatMessageRow(
    @PrimaryKey val id: String,
    val conversationId: String,
    val clientId: String?,
    val createdAt: String,
    val json: String,
    val storedAt: Long,
)

@Dao
interface ChatsDao {
    // --- List -----------------------------------------------------------------

    /** The rows the tab paints, newest conversation first. */
    @Query("SELECT * FROM threads ORDER BY lastMessageAt DESC, createdAt DESC LIMIT :limit")
    suspend fun threads(limit: Int): List<ChatThreadRow>

    @Upsert
    suspend fun upsertThreads(rows: List<ChatThreadRow>)

    /** Keeps the newest `keep` rows; the web's window is twenty. */
    @Query(
        "DELETE FROM threads WHERE id NOT IN (" +
            "SELECT id FROM threads ORDER BY lastMessageAt DESC, createdAt DESC LIMIT :keep)"
    )
    suspend fun trimThreads(keep: Int)

    @Query("DELETE FROM threads WHERE storedAt < :cutoff")
    suspend fun pruneThreads(cutoff: Long)

    // --- Headers --------------------------------------------------------------

    @Query("SELECT * FROM headers WHERE id = :id")
    suspend fun header(id: String): ChatHeaderRow?

    @Upsert
    suspend fun upsertHeader(row: ChatHeaderRow)

    @Query("DELETE FROM headers WHERE storedAt < :cutoff")
    suspend fun pruneHeaders(cutoff: Long)

    // --- Messages -------------------------------------------------------------

    @Query("SELECT * FROM messages WHERE conversationId = :conversationId ORDER BY createdAt ASC")
    suspend fun messages(conversationId: String): List<ChatMessageRow>

    @Upsert
    suspend fun upsertMessages(rows: List<ChatMessageRow>)

    @Upsert
    suspend fun upsertMessage(row: ChatMessageRow)

    @Query("SELECT * FROM messages WHERE id = :id")
    suspend fun message(id: String): ChatMessageRow?

    @Query("DELETE FROM messages WHERE id = :id")
    suspend fun deleteMessage(id: String)

    @Query("DELETE FROM messages WHERE id IN (:ids)")
    suspend fun deleteMessages(ids: List<String>)

    /** The newest `keep` lines of a conversation; the web's window is two hundred. */
    @Query(
        "DELETE FROM messages WHERE conversationId = :conversationId AND id NOT IN (" +
            "SELECT id FROM messages WHERE conversationId = :conversationId " +
            "ORDER BY createdAt DESC LIMIT :keep)"
    )
    suspend fun trimMessages(conversationId: String, keep: Int)

    @Query("DELETE FROM messages WHERE storedAt < :cutoff")
    suspend fun pruneMessages(cutoff: Long)

    // --- Outbox ---------------------------------------------------------------

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

    /** A manual retry of one line, by its client id inside the payload. */
    @Query(
        "UPDATE outbox SET status = 'pending', attempts = 0, lastError = NULL, " +
            "nextAttemptAt = 0 WHERE status = 'failed' AND type = 'message.send' " +
            "AND payload LIKE '%' || :clientId || '%'"
    )
    suspend fun retryMessage(clientId: String)

    // --- Transactions ---------------------------------------------------------

    /** A line and its replay intent, committed together (ADR-0029). */
    @Transaction
    suspend fun commitMessage(message: ChatMessageRow, intent: OutboxIntentRow) {
        upsertMessage(message)
        insertIntent(intent)
    }

    /** The server's row replaces its local twin; the queued copy goes. */
    @Transaction
    suspend fun applyServerMessage(message: ChatMessageRow, localId: String) {
        upsertMessage(message)
        deleteMessage(localId)
    }
}
