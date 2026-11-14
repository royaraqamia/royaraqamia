package com.royaraqamia.app.notes

/**
 * The words the notes surface draws that the list pair does not cover (#1390).
 *
 * List strings come from the generated `NotesListCopy`, which the page and the
 * app share (`shared/copy/notes-list.json`). These are the editor's own labels;
 * they travel here so no screen file carries a literal.
 */
internal object NotesCopy {
    const val NEW_NOTE = "ملاحظة جديدة"
    const val NEW_NOTE_HINT = "اكتب ملاحظتك هنا…"
    const val DELETE = "حذف الملاحظة"
    const val BACK = "رجوع"
}
