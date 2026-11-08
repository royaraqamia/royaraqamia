package com.royaraqamia.app.store.linksnap

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
 * LinkSnap's Local Store (#654): the links the dashboard paints and the queue of
 * writes the device has not delivered yet.
 *
 * One database per identity, named the way the web names its IndexedDB database
 * (ADR-0027, ADR-0107): `<product>__<identity>`. The partition is the filename,
 * so a store opened for one account cannot return another account's row. The
 * Outbox lives in the same file, which is what makes a queued write belong to the
 * identity that made it.
 *
 * `clientId` is the primary key because the slug can change on edit while the
 * row's identity must stay stable (ADR-0029). A tombstone is a row with
 * `deletedAt` set, kept rather than removed: the sync route is
 * tombstone-inclusive, so a delete made on another device arrives as a row and a
 * pull that dropped it would re-create the link.
 */
@Database(
    entities = [LinksnapLinkRow::class, OutboxIntentRow::class],
    version = 1,
    exportSchema = true,
)
abstract class LinksnapDatabase : RoomDatabase() {
    abstract fun linksnap(): LinksnapDao

    companion object {
        /** The product's name in every store it has. */
        const val PRODUCT = "linksnap"

        /**
         * The file this identity's rows live in: `linksnap__guest.db`,
         * `linksnap__user%3A<id>.db`. The colon is percent-encoded because the
         * name is opened, never parsed.
         */
        fun fileName(identity: Identity): String =
            "${localStoreName(PRODUCT, identity).replace(":", "%3A")}.db"
    }
}

/** One short link as the store holds it, tombstones included. */
@Entity(tableName = "links")
data class LinksnapLinkRow(
    @PrimaryKey val clientId: String,
    val code: String,
    val originalUrl: String,
    val createdAt: String,
    val updatedAt: String,
    val expiresAt: String?,
    val isBlocked: Boolean,
    val passwordProtected: Boolean,
    val deletedAt: String?,
)

@Dao
interface LinksnapDao {
    /**
     * The list the dashboard paints: live rows, newest first, the client id
     * breaking a tie — the web's own ordering
     * (`frontend/api/linksnap/local-store.ts`).
     */
    @Query("SELECT * FROM links WHERE deletedAt IS NULL ORDER BY createdAt DESC, clientId ASC")
    suspend fun links(): List<LinksnapLinkRow>

    /** Every stored row, tombstones included: the merge's local side. */
    @Query("SELECT * FROM links")
    suspend fun allLinks(): List<LinksnapLinkRow>

    @Query("SELECT * FROM links WHERE clientId = :clientId")
    suspend fun link(clientId: String): LinksnapLinkRow?

    /** One pull, one transaction: a process killed halfway writes all or none. */
    @Transaction
    suspend fun apply(rows: List<LinksnapLinkRow>) {
        upsertLinks(rows)
    }

    @Upsert
    suspend fun upsertLinks(rows: List<LinksnapLinkRow>)

    @Upsert
    suspend fun upsertLink(row: LinksnapLinkRow)

    /**
     * A write and its replay intent, committed together (#650, ADR-0109): an
     * intent can never describe a row that is not on disk, and a row can never
     * be written without the intent that will send it.
     */
    @Transaction
    suspend fun commitLink(link: LinksnapLinkRow, intent: OutboxIntentRow) {
        upsertLink(link)
        insertIntent(intent)
    }

    /**
     * A bulk write and its one replay intent, committed together (#942): every
     * row the bar acted on is durable before the intent that sends them is, and
     * the intent can never describe a row that is not on disk.
     */
    @Transaction
    suspend fun commitLinks(links: List<LinksnapLinkRow>, intent: OutboxIntentRow) {
        upsertLinks(links)
        insertIntent(intent)
    }

    // --- Outbox --------------------------------------------------------------

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
}
