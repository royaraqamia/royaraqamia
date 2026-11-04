package com.royaraqamia.app.store.blogpress

import android.content.Context
import androidx.room.Room
import com.royaraqamia.app.store.Identity

/**
 * One open BlogPress database, released with the identity it belongs to (#952).
 *
 * A wrapper rather than the database itself because `RoomDatabase` does not
 * implement `AutoCloseable`, which is the type `IdentityScopedStore` closes. The
 * wrapper also keeps Room and its builder out of the composition root and out of
 * the repository: both ask for a [BlogpressStores] and a [BlogpressDao], never
 * for a database.
 */
class BlogpressStores internal constructor(private val database: BlogpressDatabase) : AutoCloseable {
    fun dao(): BlogpressDao = database.blogpress()

    override fun close() {
        database.close()
    }

    companion object {
        /** Opens this identity's file: the web's partition with the file's extension. */
        fun open(context: Context, identity: Identity): BlogpressStores =
            BlogpressStores(
                Room.databaseBuilder(
                    context.applicationContext,
                    BlogpressDatabase::class.java,
                    BlogpressDatabase.fileName(identity),
                ).build()
            )
    }
}
