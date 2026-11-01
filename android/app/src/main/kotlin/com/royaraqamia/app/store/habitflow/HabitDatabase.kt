package com.royaraqamia.app.store.habitflow

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

/**
 * HabitFlow's Local Store (#768, #650): the rows the list paints from, and the
 * queue of writes the device has not delivered yet.
 *
 * One database per identity, named the way the web names its IndexedDB database
 * (ADR-0027): `<product>__<identity>`. The partition is the filename, so there
 * is no `user_id` column to filter on and nothing to get wrong in a query — a
 * store opened for one account cannot return another account's row, because the
 * rows are not in it. The Outbox lives in the same file, which is what makes a
 * queued write belong to the identity that made it: an intent is drained by the
 * identity that queued it, and a sign-out closes the connection without touching
 * the rows (ADR-0027, `shared/fixtures/offline-writes/habitflow.json`).
 *
 * **Migrations are forward-only and additive** (ADR-0027's rule for the web,
 * [ADR 0107] for the app): `version` moves by one per change, every change ships
 * a `Migration` that preserves existing rows, and [SCHEMAS] is committed so a
 * build cannot quietly open a database whose previous shape nobody recorded.
 * Destruction is never a fallback — a device that loses its rows on upgrade has
 * no way to tell anyone.
 *
 * [ADR 0107]: ../../../../../../../docs/adr/0107-the-habit-store-is-one-database-per-identity.md
 */
@Database(
    entities = [HabitRow::class, HabitLogRow::class, OutboxIntentRow::class],
    version = 2,
    exportSchema = true,
)
abstract class HabitDatabase : RoomDatabase() {
    abstract fun habits(): HabitDao

    companion object {
        /** The product's name in every store it has. */
        const val PRODUCT = "habitflow"

        /**
         * The file this identity's rows live in: `habitflow__guest.db`,
         * `habitflow__user%3A<id>.db`.
         *
         * The identity is the web's string (`user:<id>`) because the partition is
         * the pair; the file name percent-encodes the colon, which Android's ext4
         * would accept and a JVM path check (and a copy through a Windows machine)
         * does not. Nothing decodes it: the name is opened, not parsed.
         */
        fun fileName(identity: Identity): String =
            "${localStoreName(PRODUCT, identity).replace(":", "%3A")}.db"

        /**
         * The Outbox joined the file (#650), so a device that already holds rows
         * keeps them: `1.json` is the shape those rows were written in, and this
         * is the same database plus one empty table. The SQL is exactly the shape
         * Room exports into `2.json`, which is what the build compares a device's
         * migrated file against.
         */
        val MIGRATION_1_2: Migration = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    "CREATE TABLE IF NOT EXISTS `outbox` (" +
                        "`seq` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL, " +
                        "`id` TEXT NOT NULL, " +
                        "`entity` TEXT NOT NULL, " +
                        "`type` TEXT NOT NULL, " +
                        "`payload` TEXT NOT NULL, " +
                        "`createdAt` INTEGER NOT NULL, " +
                        "`attempts` INTEGER NOT NULL, " +
                        "`status` TEXT NOT NULL, " +
                        "`lastError` TEXT, " +
                        "`nextAttemptAt` INTEGER NOT NULL)"
                )
            }
        }
    }
}

/**
 * One habit as the store holds it.
 *
 * Column names are the property names, so a row read from `sqlite3` on a device
 * reads like the contract it came from. `frequency` and `targetPeriod` are the
 * wire strings rather than Kotlin enums: an unknown value from a newer server
 * then costs one row's rendering, not the whole pull, and the screen decides what
 * an unrecognised value looks like.
 *
 * `deletedAt` is kept rather than honoured by a delete: the sync route is
 * tombstone-inclusive (ADR-0029), so a row deleted on another device arrives as
 * a tombstone, and dropping the row would make the next pull re-create it.
 */
@Entity(tableName = "habits")
data class HabitRow(
    @PrimaryKey val id: String,
    val name: String,
    val frequency: String,
    val createdAt: String,
    val archived: Boolean,
    val target: Long?,
    val targetPeriod: String?,
    val reminderTime: String?,
    val clientId: String?,
    val updatedAt: String?,
    val deletedAt: String?,
)

/** One habit log as the store holds it; `kind` and `note` are the optional extras. */
@Entity(tableName = "habit_logs")
data class HabitLogRow(
    @PrimaryKey val id: String,
    val habitId: String,
    val date: String,
    val completed: Boolean,
    val completedAt: String?,
    val kind: String?,
    val note: String?,
    val clientId: String?,
    val updatedAt: String?,
    val deletedAt: String?,
)

@Dao
interface HabitDao {
    /**
     * The list the surface paints: live rows, the order the web's store sorts
     * into (`createdAt` ascending, id breaking a tie so two devices agree).
     *
     * Archived rows are included — the row carries `archived`, and the screen
     * decides what to do with it. Filtering here would make the store an opinion
     * instead of a mirror.
     */
    @Query("SELECT * FROM habits WHERE deletedAt IS NULL ORDER BY createdAt ASC, id ASC")
    suspend fun habits(): List<HabitRow>

    /** Live logs, oldest first; the surface's calendar reads them by date. */
    @Query("SELECT * FROM habit_logs WHERE deletedAt IS NULL ORDER BY date ASC, id ASC")
    suspend fun logs(): List<HabitLogRow>

    /** Today's logs, which is the only day the list's toggle reads. */
    @Query("SELECT * FROM habit_logs WHERE date = :date AND deletedAt IS NULL")
    suspend fun logsOn(date: String): List<HabitLogRow>

    /** Every stored habit, tombstones included: the merge's local side. */
    @Query("SELECT * FROM habits")
    suspend fun allHabits(): List<HabitRow>

    /** Every stored log, tombstones included: the merge's local side. */
    @Query("SELECT * FROM habit_logs")
    suspend fun allLogs(): List<HabitLogRow>

    @Query("SELECT * FROM habits WHERE id = :id")
    suspend fun habit(id: String): HabitRow?

    @Query("SELECT * FROM habit_logs WHERE habitId = :habitId AND date = :date")
    suspend fun log(habitId: String, date: String): HabitLogRow?

    @Query("SELECT COUNT(*) FROM habits")
    suspend fun count(): Int

    /**
     * The rows the server has told this device are gone. They are kept rather
     * than deleted (ADR-0029): a pull that dropped them would re-create the row
     * on the next sync, and a delete has to survive being pulled twice.
     */
    @Query("SELECT * FROM habits WHERE deletedAt IS NOT NULL ORDER BY id ASC")
    suspend fun tombstones(): List<HabitRow>

    @Upsert
    suspend fun upsertHabits(rows: List<HabitRow>)

    @Upsert
    suspend fun upsertLogs(rows: List<HabitLogRow>)

    @Upsert
    suspend fun upsertHabit(row: HabitRow)

    @Upsert
    suspend fun upsertLog(row: HabitLogRow)

    /**
     * One pull, one transaction: a process killed halfway through writes either
     * the whole snapshot or none of it, so the next launch paints a list and
     * never a half-list. Upsert by id is what makes a pull idempotent.
     */
    @Transaction
    suspend fun apply(habits: List<HabitRow>, logs: List<HabitLogRow>) {
        upsertHabits(habits)
        upsertLogs(logs)
    }

    /**
     * A write and its replay intent, committed together (#650): an intent can
     * never describe a row that is not on disk, and a row can never be written
     * without the intent that will send it. Either both persist or neither does,
     * which is what "durable before it is acknowledged" means.
     */
    @Transaction
    suspend fun commitHabit(habit: HabitRow, intent: OutboxIntentRow) {
        upsertHabit(habit)
        insertIntent(intent)
    }

    @Transaction
    suspend fun commitLog(log: HabitLogRow, intent: OutboxIntentRow) {
        upsertLog(log)
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
}
