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

    // The editor's shell mirrors the page's note dialog. These belong to that
    // surface rather than the copied list, so they stay beside the screen.
    const val EDITOR_LABEL = "النَّصّ"
    const val WORD = "كلمة"
    const val LAST_EDIT = "آخر تعديل"
    const val AUTOSAVES = "يُحفظ تلقائيًّا"
}
