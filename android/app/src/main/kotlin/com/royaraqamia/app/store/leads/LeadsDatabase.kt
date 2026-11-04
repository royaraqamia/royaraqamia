package com.royaraqamia.app.store.leads

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import androidx.room.Upsert
import com.royaraqamia.app.store.localStoreName
import com.royaraqamia.app.store.Identity
import com.royaraqamia.app.store.outbox.OutboxIntentRow

/**
 * The lead forms' Local Store (#929): the queue of submissions the device has
 * not delivered yet, and the reference code the server answered with.
 *
 * Leads are anonymous, so this file is **not** partitioned per identity. The
 * web's `LeadsLocalStore` opens `leads__guest` for every visitor for the same
 * reason: a lead is delivered, not owned, so a sign-in must neither hide a
 * queued submission nor send it twice. One file on the device holds every
 * pending submit until the server acknowledges each one (ADR-0029, #169).
 *
 * There is no local row to render: unlike HabitFlow or LinkSnap, a lead has no
 * copy on the device to merge. The receipt table exists only so a queued form
 * can flip to the server-minted reference code once its replay lands, which is
 * the same thing the web's submission receipt does.
 */
@Database(
    entities = [OutboxIntentRow::class, LeadReceiptRow::class],
    version = 1,
    exportSchema = true,
)
abstract class LeadsDatabase : RoomDatabase() {
    abstract fun leads(): LeadsDao

    companion object {
        /** The product's name in every store it has. */
        const val PRODUCT = "leads"

        /**
         * `leads__guest.db`, the name the web's IndexedDB uses. The identity is
         * always the guest namespace because the queue belongs to the device,
         * not to the account that happened to be signed in when it was made.
         */
        fun fileName(): String =
            "${localStoreName(PRODUCT, Identity.Guest).replace(":", "%3A")}.db"
    }
}

/**
 * The reference code one form's replayed submission earned. `kind` is the lead
 * form (`training`, `project-request`, `retainer`), so one form's code cannot
 * appear on another's confirmation.
 */
@Entity(tableName = "lead_receipts")
data class LeadReceiptRow(
    @PrimaryKey val kind: String,
    val referenceCode: String,
    val updatedAt: Long,
)

@Dao
interface LeadsDao {
    // --- Outbox --------------------------------------------------------------

    /** Every intent, in strict replay order: the order the writes were made. */
    @Query("SELECT * FROM outbox ORDER BY seq ASC")
    suspend fun outbox(): List<OutboxIntentRow>

    @Query("SELECT COUNT(*) FROM outbox WHERE status = :status")
    suspend fun countIntents(status: String): Int

    /** The kinds with an intent still in the queue, so a form can say "queued". */
    @Query("SELECT DISTINCT type FROM outbox WHERE status IN ('pending', 'failed')")
    suspend fun queuedTypes(): List<String>

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

    // --- Receipts ------------------------------------------------------------

    @Query("SELECT * FROM lead_receipts WHERE kind = :kind")
    suspend fun receipt(kind: String): LeadReceiptRow?

    @Upsert
    suspend fun upsertReceipt(row: LeadReceiptRow)

    @Query("DELETE FROM lead_receipts WHERE kind = :kind")
    suspend fun clearReceipt(kind: String)
}
