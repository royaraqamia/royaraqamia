package com.royaraqamia.app.store.spendtrack

import androidx.room.Dao
import androidx.room.Database
import androidx.room.Entity
import androidx.room.Insert
import androidx.room.PrimaryKey
import androidx.room.Query
import androidx.room.RoomDatabase
import androidx.room.Transaction
import androidx.room.Upsert
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase
import com.royaraqamia.app.store.Identity
import com.royaraqamia.app.store.localStoreName
import com.royaraqamia.app.store.outbox.OutboxIntentRow

/**
 * SpendTrack's Local Store (#653): the rows the screen paints from, and the
 * queue of writes the device has not delivered yet.
 *
 * One database per identity, named the way the web names its IndexedDB database
 * (ADR-0027, ADR-0107): `<product>__<identity>`. The partition is the filename,
 * so there is no `user_id` column to filter on and nothing to get wrong in a
 * query — a store opened for one account cannot return another account's row,
 * because the rows are not in it. The Outbox lives in the same file, which is
 * what makes a queued write belong to the identity that made it.
 *
 * The tables are the two the app draws — categories and expenses. Budgets and
 * recurring expenses arrive in the snapshot and are deliberately not stored: the
 * app has no screen for them yet, and a row nobody reads is a row that can drift
 * from the one the server holds. The pull writes only what this client shows.
 */
@Database(
    entities = [
        SpendtrackCategoryRow::class,
        SpendtrackExpenseRow::class,
        SpendtrackBudgetRow::class,
        SpendtrackRecurringRow::class,
        SpendtrackMetaRow::class,
        OutboxIntentRow::class,
    ],
    version = 2,
    exportSchema = true,
)
abstract class SpendtrackDatabase : RoomDatabase() {
    abstract fun spendtrack(): SpendtrackDao

    companion object {
        /** The product's name in every store it has. */
        const val PRODUCT = "spendtrack"

        /**
         * The file this identity's rows live in: `spendtrack__guest.db`,
         * `spendtrack__user%3A<id>.db`. The colon is percent-encoded for the same
         * reason the habit store's is: the name is opened, never parsed.
         */
        fun fileName(identity: Identity): String =
            "${localStoreName(PRODUCT, identity).replace(":", "%3A")}.db"

        /**
         * Budgets and recurring expenses joined the file (#653): the app draws
         * both now, so the pull writes them instead of dropping them. Forward-only
         * and additive — a device that already holds expenses keeps them, and the
         * SQL is exactly the shape Room exports into `2.json`.
         */
        val MIGRATION_1_2: Migration = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `budgets` (" +
                        "`id` TEXT NOT NULL, " +
                        "`month` TEXT NOT NULL, " +
                        "`amount` REAL NOT NULL, " +
                        "`categoryId` TEXT, " +
                        "`clientId` TEXT, " +
                        "`updatedAt` TEXT, " +
                        "`deletedAt` TEXT, " +
                        "PRIMARY KEY(`id`))"
                )
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `recurring` (" +
                        "`id` TEXT NOT NULL, " +
                        "`amount` REAL NOT NULL, " +
                        "`categoryId` TEXT NOT NULL, " +
                        "`description` TEXT, " +
                        "`dayOfMonth` INTEGER NOT NULL, " +
                        "`startMonth` TEXT NOT NULL, " +
                        "`active` INTEGER NOT NULL, " +
                        "`clientId` TEXT, " +
                        "`updatedAt` TEXT, " +
                        "`deletedAt` TEXT, " +
                        "PRIMARY KEY(`id`))"
                )
            }
        }
    }
}

/**
 * One category as the store holds it, tombstones included.
 *
 * `userId` is null for the shared default categories, which is also how the
 * site marks a row nobody may edit (`category-list.tsx`'s `افتراضي` badge).
 * `deletedAt` is kept rather than honoured by a delete: the sync route is
 * tombstone-inclusive (ADR-0029), so a row deleted on another device arrives as
 * a tombstone, and dropping it would make the next pull re-create it.
 */
@Entity(tableName = "categories")
data class SpendtrackCategoryRow(
    @PrimaryKey val id: String,
    val userId: String?,
    val name: String,
    val colorHex: String,
    val createdAt: String,
    val clientId: String?,
    val updatedAt: String?,
    val deletedAt: String?,
)

/**
 * One expense as the store holds it.
 *
 * `splits` is the JSON the server last sent, kept verbatim so an edit made here
 * re-sends the splits it did not touch. The app draws no split editor yet; a
 * write that dropped them would delete another device's work, and clearing them
 * is not this screen's decision to make.
 */
@Entity(tableName = "expenses")
data class SpendtrackExpenseRow(
    @PrimaryKey val id: String,
    val categoryId: String,
    val amount: Double,
    val description: String?,
    val date: String,
    val currency: String?,
    val createdAt: String,
    val splits: String?,
    val clientId: String?,
    val updatedAt: String?,
    val deletedAt: String?,
)

/**
 * One recurring expense as the store holds it (#653).
 *
 * `dayOfMonth` is a number, not a date: the site schedules by the day of the
 * month and the server materialises the row monthly, so this client only has to
 * remember which day was chosen.
 */
@Entity(tableName = "recurring")
data class SpendtrackRecurringRow(
    @PrimaryKey val id: String,
    val amount: Double,
    val categoryId: String,
    val description: String?,
    val dayOfMonth: Long,
    val startMonth: String,
    val active: Boolean,
    val clientId: String?,
    val updatedAt: String?,
    val deletedAt: String?,
)

/**
 * One month's budget as the store holds it (#653).
 *
 * The id is the local key — `2026-01#` for the month's own budget, `2026-01#<id>`
 * for a category's — because that is what the web's store keys on: the server
 * identifies a budget by `(user_id, month, category_id)` and mints no stable id a
 * device could replay against.
 */
@Entity(tableName = "budgets")
data class SpendtrackBudgetRow(
    @PrimaryKey val id: String,
    val month: String,
    val amount: Double,
    val categoryId: String?,
    val clientId: String?,
    val updatedAt: String?,
    val deletedAt: String?,
)

/** The local key for a budget: one row per (month, category). */
fun budgetKey(month: String, categoryId: String?): String = "$month#${categoryId.orEmpty()}"

/** One key/value fact the store keeps beside the rows: the sync cursor and the currency. */
@Entity(tableName = "meta")
data class SpendtrackMetaRow(
    @PrimaryKey val key: String,
    val value: String,
)

@Dao
interface SpendtrackDao {
    /**
     * The list the screen paints: live expenses, newest day first and the id
     * breaking a tie so two devices agree — the web's own ordering
     * (`SpendtrackLocalStore.getExpenses`).
     */
    @Query("SELECT * FROM expenses WHERE deletedAt IS NULL ORDER BY date DESC, id ASC")
    suspend fun expenses(): List<SpendtrackExpenseRow>

    /** Live categories by name, which is the web's ordering for this list. */
    @Query("SELECT * FROM categories WHERE deletedAt IS NULL ORDER BY name ASC, id ASC")
    suspend fun categories(): List<SpendtrackCategoryRow>

    @Query("SELECT * FROM expenses")
    suspend fun allExpenses(): List<SpendtrackExpenseRow>

    @Query("SELECT * FROM categories")
    suspend fun allCategories(): List<SpendtrackCategoryRow>

    /** The month's budgets and its categories', tombstones excluded. */
    @Query("SELECT * FROM budgets WHERE month = :month AND deletedAt IS NULL ORDER BY id ASC")
    suspend fun budgets(month: String): List<SpendtrackBudgetRow>

    @Query("SELECT * FROM budgets")
    suspend fun allBudgets(): List<SpendtrackBudgetRow>

    /** Recurring expenses, by the day they fall on — the site's ordering. */
    @Query("SELECT * FROM recurring WHERE deletedAt IS NULL ORDER BY dayOfMonth ASC, id ASC")
    suspend fun recurring(): List<SpendtrackRecurringRow>

    @Query("SELECT * FROM recurring")
    suspend fun allRecurring(): List<SpendtrackRecurringRow>

    @Query("SELECT * FROM budgets WHERE id = :id")
    suspend fun budget(id: String): SpendtrackBudgetRow?

    @Query("SELECT * FROM recurring WHERE id = :id")
    suspend fun recurringRow(id: String): SpendtrackRecurringRow?

    @Query("SELECT * FROM expenses WHERE id = :id")
    suspend fun expense(id: String): SpendtrackExpenseRow?

    @Query("SELECT * FROM categories WHERE id = :id")
    suspend fun category(id: String): SpendtrackCategoryRow?

    /** One pull, one transaction: a process killed halfway writes all of it or none. */
    @Transaction
    suspend fun apply(
        categories: List<SpendtrackCategoryRow>,
        expenses: List<SpendtrackExpenseRow>,
        budgets: List<SpendtrackBudgetRow>,
        recurring: List<SpendtrackRecurringRow>,
    ) {
        upsertCategories(categories)
        upsertExpenses(expenses)
        upsertBudgets(budgets)
        upsertRecurring(recurring)
    }

    @Upsert
    suspend fun upsertCategories(rows: List<SpendtrackCategoryRow>)

    @Upsert
    suspend fun upsertExpenses(rows: List<SpendtrackExpenseRow>)

    @Upsert
    suspend fun upsertCategory(row: SpendtrackCategoryRow)

    @Upsert
    suspend fun upsertExpense(row: SpendtrackExpenseRow)

    @Upsert
    suspend fun upsertBudgets(rows: List<SpendtrackBudgetRow>)

    @Upsert
    suspend fun upsertRecurring(rows: List<SpendtrackRecurringRow>)

    @Upsert
    suspend fun upsertBudget(row: SpendtrackBudgetRow)

    @Upsert
    suspend fun upsertRecurring(row: SpendtrackRecurringRow)

    /**
     * A write and its replay intent, committed together (#650, ADR-0109): an
     * intent can never describe a row that is not on disk, and a row can never be
     * written without the intent that will send it.
     */
    @Transaction
    suspend fun commitExpense(expense: SpendtrackExpenseRow, intent: OutboxIntentRow) {
        upsertExpense(expense)
        insertIntent(intent)
    }

    @Transaction
    suspend fun commitCategory(category: SpendtrackCategoryRow, intent: OutboxIntentRow) {
        upsertCategory(category)
        insertIntent(intent)
    }

    @Transaction
    suspend fun commitBudget(budget: SpendtrackBudgetRow, intent: OutboxIntentRow) {
        upsertBudget(budget)
        insertIntent(intent)
    }

    @Transaction
    suspend fun commitRecurring(recurring: SpendtrackRecurringRow, intent: OutboxIntentRow) {
        upsertRecurring(recurring)
        insertIntent(intent)
    }

    // --- Meta ----------------------------------------------------------------

    @Query("SELECT value FROM meta WHERE key = :key")
    suspend fun meta(key: String): String?

    @Upsert
    suspend fun putMeta(row: SpendtrackMetaRow)

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
