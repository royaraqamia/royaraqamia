package com.royaraqamia.app.quran

import android.content.Context
import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.Transaction
import androidx.room.Upsert
import com.royaraqamia.app.store.Identity
import com.royaraqamia.app.store.localStoreName
import com.royaraqamia.app.store.outbox.OutboxIntentRow

/**
 * The reader's Local Store (#1751): marks, the reading position, the pull
 * cursor and the queue of owned writes.
 *
 * One database per identity, named the way the web names its IndexedDB store
 * (`<product>__<identity>`, ADR-0027): a guest's marks stay on the device and
 * an account's marks live in its own file, with no `user_id` column to filter
 * on. The Outbox and the position are in the same file, so a queued write
 * belongs to the identity that made it.
 */
@Database(
    entities =
        [QuranBookmarkRow::class, QuranPositionRow::class, QuranOwnMetaRow::class, OutboxIntentRow::class],
    version = 1,
    exportSchema = true,
)
abstract class QuranOwnDatabase : RoomDatabase() {
    abstract fun dao(): QuranOwnDao

    companion object {
        const val PRODUCT = "quran"

        fun fileName(identity: Identity): String =
            "${localStoreName(PRODUCT, identity).replace(":", "%3A")}.db"

    }
}

/**
 * One open reader database, released with the identity it belongs to.
 *
 * A wrapper rather than the database itself because `RoomDatabase` does not
 * implement `AutoCloseable`, which is the bound `IdentityScopedStore` needs.
 */
class QuranOwnStores internal constructor(private val database: QuranOwnDatabase) : AutoCloseable {
    fun dao(): QuranOwnDao = database.dao()

    override fun close() {
        database.close()
    }

    companion object {
        fun open(context: Context, identity: Identity): QuranOwnStores =
            QuranOwnStores(
                Room.databaseBuilder(
                    context.applicationContext,
                    QuranOwnDatabase::class.java,
                    QuranOwnDatabase.fileName(identity),
                ).build()
            )
    }
}

/** One mark. The client id is the key the server also knows it by. */
@Entity(tableName = "quran_bookmarks")
data class QuranBookmarkRow(
    @PrimaryKey val clientId: String,
    val surah: Int,
    val ayah: Int,
    val createdAt: String,
    val updatedAt: String,
    val deletedAt: String?,
)

/** The reader's one position, held as a single row. */
@Entity(tableName = "quran_position")
data class QuranPositionRow(
    @PrimaryKey val key: Int = 1,
    val surah: Int,
    val ayah: Int,
    val updatedAt: String,
    val clientId: String,
)

/** The pull's cursor: the newest server stamp this device has applied. */
@Entity(tableName = "quran_meta")
data class QuranOwnMetaRow(@PrimaryKey val key: String, val value: String)

@Dao
interface QuranOwnDao {
    @Query("SELECT * FROM quran_bookmarks WHERE deletedAt IS NULL ORDER BY updatedAt DESC, clientId DESC")
    suspend fun liveBookmarks(): List<QuranBookmarkRow>

    @Query("SELECT * FROM quran_bookmarks")
    suspend fun allBookmarks(): List<QuranBookmarkRow>

    @Query("SELECT * FROM quran_bookmarks WHERE surah = :surah AND ayah = :ayah")
    suspend fun bookmark(surah: Int, ayah: Int): QuranBookmarkRow?

    @Query("SELECT * FROM quran_position WHERE key = 1")
    suspend fun position(): QuranPositionRow?

    @Query("SELECT * FROM quran_meta WHERE key = :key")
    suspend fun meta(key: String): QuranOwnMetaRow?

    @Upsert
    suspend fun upsertBookmark(row: QuranBookmarkRow)

    @Upsert
    suspend fun upsertBookmarks(rows: List<QuranBookmarkRow>)

    @Upsert
    suspend fun upsertPosition(row: QuranPositionRow)

    @Upsert
    suspend fun upsertMeta(row: QuranOwnMetaRow)

    /** A mark and its replay intent, or neither: the tap is durable. */
    @Transaction
    suspend fun commitBookmark(row: QuranBookmarkRow, intent: OutboxIntentRow) {
        upsertBookmark(row)
        insertIntent(intent)
    }

    /** A position supersedes the write still queued for an older Ayah. */
    @Transaction
    suspend fun commitPosition(row: QuranPositionRow, intent: OutboxIntentRow) {
        deleteIntentsOfType(POSITION_INTENT)
        upsertPosition(row)
        insertIntent(intent)
    }

    /** One pull applied whole; a held-back row keeps the cursor where it was. */
    @Transaction
    suspend fun applyPull(bookmarks: List<QuranBookmarkRow>, cursor: String?) {
        upsertBookmarks(bookmarks)
        if (cursor != null) upsertMeta(QuranOwnMetaRow(CURSOR_KEY, cursor))
    }

    @Query("SELECT * FROM outbox ORDER BY seq ASC")
    suspend fun outbox(): List<OutboxIntentRow>

    @Query("SELECT COUNT(*) FROM outbox WHERE status = :status")
    suspend fun countIntents(status: String): Int

    @Insert
    suspend fun insertIntent(intent: OutboxIntentRow): Long

    @Query("DELETE FROM outbox WHERE seq = :seq")
    suspend fun deleteIntent(seq: Long)

    @Query("DELETE FROM outbox WHERE type = :type")
    suspend fun deleteIntentsOfType(type: String)

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

    @Query(
        "UPDATE outbox SET status = 'pending', attempts = 0, lastError = NULL, " +
            "nextAttemptAt = 0 WHERE status = 'failed'"
    )
    suspend fun retryFailedIntents()

    @Query("DELETE FROM quran_bookmarks")
    suspend fun clearBookmarks()

    @Query("DELETE FROM quran_position")
    suspend fun clearPosition()

    @Query("DELETE FROM outbox")
    suspend fun clearOutbox()

    @Query("DELETE FROM quran_meta")
    suspend fun clearMeta()

    companion object {
        const val CURSOR_KEY = "syncCursor"
        const val POSITION_INTENT = "quran.position.set"
        const val BOOKMARK_INTENT = "quran.bookmark.set"
    }
}
