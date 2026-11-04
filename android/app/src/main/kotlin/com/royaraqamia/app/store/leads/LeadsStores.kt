package com.royaraqamia.app.store.leads

import android.content.Context
import androidx.room.Room

/**
 * The one leads database on the device (#929), released with the graph that
 * opened it.
 *
 * A wrapper rather than the database itself because `RoomDatabase` is not
 * `AutoCloseable`, and the graph closes what it opened. It keeps `Room` out of
 * the composition root and out of the repository: both ask for a [LeadsStores]
 * and a [LeadsDao], never for a database.
 *
 * Unlike the owned products' stores this one is not opened per identity: a lead
 * is anonymous, and its queue has to survive a sign-in (the web's
 * `LeadsLocalStore` does the same).
 */
class LeadsStores internal constructor(private val database: LeadsDatabase) : AutoCloseable {
    fun dao(): LeadsDao = database.leads()

    override fun close() {
        database.close()
    }

    companion object {
        fun open(context: Context): LeadsStores =
            LeadsStores(
                Room.databaseBuilder(
                    context.applicationContext,
                    LeadsDatabase::class.java,
                    LeadsDatabase.fileName(),
                ).build()
            )
    }
}
