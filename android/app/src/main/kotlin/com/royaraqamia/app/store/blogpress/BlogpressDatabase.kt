package com.royaraqamia.app.store.blogpress

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
 * BlogPress's Local Store (#952): the posts the dashboard paints and the queue
 * of writes the device has not delivered yet.
 *
 * One database per identity, named the way the web names its IndexedDB database
 * (ADR-0027, ADR-0107): `<product>__<identity>`. The partition is the filename,
 * so a store opened for one account cannot return another account's row. The
 * Outbox lives in the same file, which is what makes a queued write belong to
 * the identity that made it.
 *
 * `clientId` is the primary key because the server's `id` and the client-minted
 * identity are the same row on different sides of the replay (ADR-0029). A
 * tombstone is a row with `deletedAt` set, kept rather than removed: the sync
 * route is tombstone-inclusive, so a delete made on another device arrives as a
 * row and a pull that dropped it would re-create the post.
 */
@Database(
    entities = [BlogpressPostRow::class, OutboxIntentRow::class],
    version = 1,
    exportSchema = true,
)
abstract class BlogpressDatabase : RoomDatabase() {
    abstract fun blogpress(): BlogpressDao

    companion object {
        /** The product's name in every store it has. */
        const val PRODUCT = "blogpress"

        /**
         * The file this identity's rows live in: `blogpress__guest.db`,
         * `blogpress__user%3A<id>.db`. The colon is percent-encoded because the
         * name is opened, never parsed.
         */
        fun fileName(identity: Identity): String =
            "${localStoreName(PRODUCT, identity).replace(":", "%3A")}.db"
    }
}

/**
 * One owned post as the store holds it, tombstones included.
 *
 * The columns are the web draft's own (`frontend/api/blogpress/local-store.ts`)
 * so a device dump reads the same on both clients. `status` stays the wire's
 * word (`draft` | `published` | `scheduled`) rather than an enum: a row written
 * by a newer server must be readable here, not a migration.
 */
@Entity(tableName = "posts")
data class BlogpressPostRow(
    @PrimaryKey val clientId: String,
    val id: String,
    val slug: String,
    val content: String,
    val status: String,
    val coverImage: String,
    val metaTitle: String,
    val metaDesc: String,
    val publishAt: String?,
    val publishedAt: String?,
    val viewCount: Long,
    val featured: Boolean,
    val communityVisible: Boolean,
    val readingTimeMinutes: Long,
    val createdAt: String,
    val updatedAt: String,
    val deletedAt: String?,
)

@Dao
interface BlogpressDao {
    /**
     * The list the dashboard paints: live rows, newest write first, the client
     * id breaking a tie — the web's own ordering
     * (`BlogpressLocalStore.getDrafts`).
     */
    @Query("SELECT * FROM posts WHERE deletedAt IS NULL ORDER BY updatedAt DESC, clientId ASC")
    suspend fun posts(): List<BlogpressPostRow>

    /** Every stored row, tombstones included: the merge's local side. */
    @Query("SELECT * FROM posts")
    suspend fun allPosts(): List<BlogpressPostRow>

    @Query("SELECT * FROM posts WHERE clientId = :clientId")
    suspend fun post(clientId: String): BlogpressPostRow?

    /**
     * The row the editor opened. The dashboard hands it the server's id while the
     * store keys on `clientId`, and the two are the same row on different sides
     * of the replay (ADR-0029), so either one finds it.
     */
    @Query("SELECT * FROM posts WHERE id = :id OR clientId = :id LIMIT 1")
    suspend fun postByAnyId(id: String): BlogpressPostRow?

    /** One pull, one transaction: a process killed halfway writes all or none. */
    @Transaction
    suspend fun apply(rows: List<BlogpressPostRow>) {
        upsertPosts(rows)
    }

    @Upsert
    suspend fun upsertPosts(rows: List<BlogpressPostRow>)

    @Upsert
    suspend fun upsertPost(row: BlogpressPostRow)

    /**
     * A write and its replay intent, committed together (#650, ADR-0109): an
     * intent can never describe a row that is not on disk, and a row can never
     * be written without the intent that will send it.
     */
    @Transaction
    suspend fun commitPost(post: BlogpressPostRow, intent: OutboxIntentRow) {
        upsertPost(post)
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
