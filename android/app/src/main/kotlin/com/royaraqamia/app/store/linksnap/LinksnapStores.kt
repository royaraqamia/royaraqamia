package com.royaraqamia.app.store.linksnap

import android.content.Context
import androidx.room.Room
import com.royaraqamia.app.store.Identity

/**
 * One open LinkSnap database, released with the identity it belongs to (#654).
 *
 * A wrapper rather than the database itself because `RoomDatabase` does not
 * implement `AutoCloseable`, which is the type `IdentityScopedStore` closes. The
 * wrapper also keeps Room and its builder out of the composition root and out of
 * the repository: both ask for a [LinksnapStores] and a [LinksnapDao], never for
 * a database.
 */
class LinksnapStores internal constructor(private val database: LinksnapDatabase) : AutoCloseable {
    fun dao(): LinksnapDao = database.linksnap()

    override fun close() {
        database.close()
    }

    companion object {
        fun open(context: Context, identity: Identity): LinksnapStores =
            LinksnapStores(
                Room.databaseBuilder(
                    context.applicationContext,
                    LinksnapDatabase::class.java,
                    LinksnapDatabase.fileName(identity),
                ).build()
            )
    }
}
