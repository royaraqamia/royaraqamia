package com.royaraqamia.app.store.chats

import android.content.Context
import androidx.room.Room
import com.royaraqamia.app.store.Identity

/**
 * One open Chats database, released with the identity it belongs to (#1127).
 *
 * A wrapper rather than the database itself because `RoomDatabase` does not
 * implement `AutoCloseable`, which is the type [com.royaraqamia.app.store.
 * IdentityScopedStore] closes. The wrapper also keeps Room and its builder out of
 * the composition root and out of the repository: both ask for a
 * [ChatsStores] and a [ChatsDao], never for a database.
 */
class ChatsStores internal constructor(private val database: ChatsDatabase) : AutoCloseable {
    fun dao(): ChatsDao = database.chats()

    override fun close() {
        database.close()
    }

    companion object {
        /** Opens this identity's file: the web's partition with the file's extension. */
        fun open(context: Context, identity: Identity): ChatsStores =
            ChatsStores(
                Room.databaseBuilder(
                    context.applicationContext,
                    ChatsDatabase::class.java,
                    ChatsDatabase.fileName(identity),
                ).build()
            )
    }
}
