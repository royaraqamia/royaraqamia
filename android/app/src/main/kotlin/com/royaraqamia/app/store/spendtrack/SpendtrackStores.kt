package com.royaraqamia.app.store.spendtrack

import android.content.Context
import androidx.room.Room
import com.royaraqamia.app.store.Identity

/**
 * One open SpendTrack database, released with the identity it belongs to (#653).
 *
 * A wrapper rather than the database itself because `RoomDatabase` does not
 * implement `AutoCloseable`, which is the type `IdentityScopedStore` closes.
 * The wrapper also keeps Room and its builder out of the composition root and
 * out of the repository: both ask for a [SpendtrackStores] and a
 * [SpendtrackDao], never for a database.
 */
class SpendtrackStores internal constructor(private val database: SpendtrackDatabase) : AutoCloseable {
    fun dao(): SpendtrackDao = database.spendtrack()

    override fun close() {
        database.close()
    }

    companion object {
        /**
         * Opens this identity's file. The name is the web's partition with the
         * file's extension, so a device dump reads the same on both clients
         * (`spendtrack__user:<id>.db`).
         */
        fun open(context: Context, identity: Identity): SpendtrackStores =
            SpendtrackStores(
                Room.databaseBuilder(
                    context.applicationContext,
                    SpendtrackDatabase::class.java,
                    SpendtrackDatabase.fileName(identity),
                ).build()
            )
    }
}
