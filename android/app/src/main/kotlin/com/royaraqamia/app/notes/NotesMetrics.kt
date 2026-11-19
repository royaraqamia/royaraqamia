package com.royaraqamia.app.notes

import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * The notes surface's measured design (#1628, ADR-0118).
 *
 * These are the numbers `shared/visual/notes.json` measures on the page at 393 x
 * 852 CSS px, at the DPR the app composes at. The screen draws with them and the
 * visual test reads them back, so a number in `app.json` is the style the screen
 * actually used rather than a second copy kept in a test.
 */
internal object NotesMetrics {
    const val TITLE = "notes-title"
    const val LIST = "notes-list"
    const val SEARCH = "notes-search"
    const val EMPTY = "notes-empty"
    const val EMPTY_TITLE = "notes-empty-title"
    const val EMPTY_BODY = "notes-empty-body"
    const val ROW = "notes-row"
    const val EDITOR = "notes-editor"
    const val EDITOR_BODY = "notes-editor-body"

    val screenPaddingX = 16.dp
    val screenPaddingY = 12.dp

    val titleHeight = 46.5.dp
    val titleLineHeight = 37.5.sp
    val titleSize = 30.sp
    val titleWeight = FontWeight(800)
    val titleToList = 48.dp

    val listRadius = 24.dp
    val listBorder = 1.dp
    val searchPad = 12.dp
    val searchHeight = 44.dp
    val searchRadius = 12.dp
    val searchSize = 14.sp

    val emptyMinHeight = 342.2.dp
    val emptyPadding = 32.dp
    // The page's empty block is p-8, but Chromium's line boxes settle half a
    // pixel differently from Compose's; the extra bottom inset centres the two
    // sentences on the same row the page records.
    val emptyPaddingBottom = 35.4.dp
    val emptyTitleHeight = 20.dp
    val emptyTitleLineHeight = 20.sp
    val emptyTitleSize = 14.sp
    val emptyTitleWeight = FontWeight(700)
    val emptyTitleToBody = 12.dp
    val emptyBodyWidth = 158.4.dp
    val emptyBodySize = 12.sp
    val emptyBodyLineHeight = 19.5.sp

    val rowRadius = 16.dp
    val rowPaddingX = 12.dp
    val rowPaddingY = 10.dp

    val editorWidth = 343.dp
    val editorHeight = 686.dp
    val editorLabelHeight = 14.dp
    val editorLabelLineHeight = 14.sp
    val editorLabelSize = 14.sp
    val editorLabelWeight = FontWeight(500)
    val editorGap = 6.dp
    val editorBodyHeight = 642.4.dp
    val editorBodyRadius = 12.dp
    val editorBodyBorder = 1.dp
    val editorBodyTextTop = 23.dp
    val editorBodyTextPad = 16.dp
    val editorBodyTextSize = 16.sp
    val editorBodyLineHeight = 25.6.sp
    val editorMetaHeight = 17.6.dp
    val editorMetaSize = 11.sp

    val editorMetaLineHeight = 17.6.sp
}
