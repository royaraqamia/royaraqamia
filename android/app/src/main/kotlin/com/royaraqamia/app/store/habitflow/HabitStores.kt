package com.royaraqamia.app.store.habitflow

import android.content.Context
import androidx.room.Room
import com.royaraqamia.app.store.Identity

/**
 * One open HabitFlow database, released with the identity it belongs to
 * (#768).
 *
 * A wrapper rather than the database itself because `RoomDatabase` does not
 * implement `AutoCloseable`, and the scope in `IdentityScopedStore` needs a
 * type it can close. The wrapper also keeps `Room` and its builder out of the
 * composition root and out of the repository: both ask for a [HabitStores] and
 * a [HabitDao], never for a database.
 */
class HabitStores internal constructor(private val database: HabitDatabase) : AutoCloseable {
    fun dao(): HabitDao = database.habits()

    override fun close() {
        database.close()
    }

    companion object {
        /**
         * Opens this identity's file. The name is the web's partition with the
         * file's extension, so a device dump reads the same on both clients
         * (`habitflow__user:<id>.db`).
         */
        fun open(context: Context, identity: Identity): HabitStores =
            HabitStores(
                Room.databaseBuilder(
                    context.applicationContext,
                    HabitDatabase::class.java,
                    HabitDatabase.fileName(identity),
                ).build()
            )
    }
}
