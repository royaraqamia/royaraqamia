package com.royaraqamia.app.store.notes

import android.content.Context
import androidx.room.Room
import com.royaraqamia.app.store.Identity

/**
 * One open Notes database, released with the identity it belongs to (#1390).
 *
 * A wrapper rather than the database itself because `RoomDatabase` does not
 * implement `AutoCloseable`, and the scope in `IdentityScopedStore` needs a type
 * it can close. It also keeps Room and its builder out of the composition root
 * and out of the repository: both ask for a [NotesStores] and a [NoteDao], never
 * for a database.
 */
class NotesStores internal constructor(private val database: NotesDatabase) : AutoCloseable {
    fun dao(): NoteDao = database.notes()

    override fun close() {
        database.close()
    }

    companion object {
        /** Opens this identity's file (`notes__user:<id>.db`). */
        fun open(context: Context, identity: Identity): NotesStores =
            NotesStores(
                Room.databaseBuilder(
                    context.applicationContext,
                    NotesDatabase::class.java,
                    NotesDatabase.fileName(identity),
                ).build()
            )
    }
}
