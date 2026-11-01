package com.royaraqamia.app.store.habitflow

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.test.core.app.ApplicationProvider
import com.royaraqamia.app.store.Identity
import com.royaraqamia.app.store.IdentityScopedStore
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import java.io.File

/**
 * The Outbox joined a database that already holds rows (#650).
 *
 * The migration is the one thing a device-only change can lose silently: a
 * `version = 2` with no migration throws on the first launch after the update,
 * and a destructive fallback would open a fresh file and take the habits with
 * it. This builds the exact shape `1.json` records — the same DDL Room exported,
 * with the same identity hash — then opens it through the real
 * [HabitStores.open], so a migration that drifts from the entity is a failing
 * test rather than a device's lost rows.
 */
@RunWith(RobolectricTestRunner::class)
class HabitDatabaseMigrationTest {
    private lateinit var context: Context
    private lateinit var databases: IdentityScopedStore<HabitStores>

    private val alice = Identity.User("alice-id")

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        databases = IdentityScopedStore { identity -> HabitStores.open(context, identity) }
    }

    @After
    fun tearDown() {
        databases.close()
        context.deleteDatabase(HabitDatabase.fileName(alice))
    }

    @Test
    fun `a version 1 store gains the outbox and keeps its habits`() = runBlocking {
        writeVersionOneFile()

        val dao = databases.forIdentity(alice).dao()

        assertEquals("the habit survived the upgrade", listOf("Read Quran"), dao.habits().map { it.name })
        assertEquals("an empty queue, not a missing table", emptyList<OutboxIntentRow>(), dao.outbox())
        assertEquals(0, dao.countIntents(OutboxIntentRow.STATUS_PENDING))
    }

    /** The `1.json` Room exported, executed as the device holds it before #650. */
    private fun writeVersionOneFile() {
        val schema = schema(databaseName = "1.json")
        val entities = schema.getValue("database").jsonObject.getValue("entities").jsonArray
        val identityHash = schema.getValue("database").jsonObject.getValue("identityHash").jsonPrimitive.content

        val file = context.getDatabasePath(HabitDatabase.fileName(alice))
        file.parentFile?.mkdirs()
        val db = SQLiteDatabase.openOrCreateDatabase(file, null)
        try {
            for (entity in entities.map { it.jsonObject }) {
                val table = entity.getValue("tableName").jsonPrimitive.content
                db.execSQL(entity.getValue("createSql").jsonPrimitive.content.replace("\${TABLE_NAME}", table))
            }
            db.execSQL("CREATE TABLE room_master_table (id INTEGER PRIMARY KEY, identity_hash TEXT)")
            db.execSQL("INSERT OR REPLACE INTO room_master_table (id, identity_hash) VALUES (42, ?)", arrayOf(identityHash))
            db.execSQL(
                "INSERT INTO habits (id, name, frequency, createdAt, archived, target, " +
                    "targetPeriod, reminderTime, clientId, updatedAt, deletedAt) " +
                    "VALUES ('h-1', 'Read Quran', 'daily', '2026-01-01T00:00:00.000Z', 0, NULL, " +
                    "NULL, NULL, 'h-1', '2026-01-01T00:00:00.000Z', NULL)"
            )
            db.version = 1
        } finally {
            db.close()
        }
    }

    private fun schema(databaseName: String) = Json.parseToJsonElement(File(path(databaseName)).readText()).jsonObject

    private fun path(databaseName: String): String {
        val start = File(System.getProperty("user.dir") ?: ".").absoluteFile
        var candidate: File? = start
        while (candidate != null) {
            val directory =
                File(candidate, "android/app/schemas/com.royaraqamia.app.store.habitflow.HabitDatabase")
            if (directory.isDirectory) return File(directory, databaseName).path
            candidate = candidate.parentFile
        }
        throw IllegalStateException("the exported HabitDatabase schemas were not found above $start")
    }
}
