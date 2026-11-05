package com.royaraqamia.app.habitflow

import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * The page's numbers for HabitFlow's list, as one source the screen and its
 * visual test both read (#898, ADR-0118).
 *
 * They are what `app/habitflow` resolves to at 393 x 852: the list's 329-wide
 * column inside the page's doubled padding, its 24/700 title in a 32-high line,
 * the 8 padding and 1 transparent border under it, the 24 gap to the empty block,
 * and that block's 24 radius, 56 padding and 64 icon tile. Keeping them here
 * rather than inline is what lets the test measure the numbers the screen draws,
 * so a change to one without the other fails `check:visual` instead of drifting.
 *
 * The count pill's 22 high is the page's 16-high line plus its 2 + 2 padding and
 * 1 + 1 border; Compose's border does not consume layout, so the screen pads 3
 * and this records the page's own 2.
 */
internal object HabitflowMetrics {
    const val LIST = "habitflow-list"
    const val HEADER = "habitflow-header"
    const val TITLE = "habitflow-title"
    const val COUNT = "habitflow-count"
    const val EMPTY = "habitflow-empty"
    const val EMPTY_ICON = "habitflow-empty-icon"
    const val EMPTY_TITLE = "habitflow-empty-title"
    const val EMPTY_BODY = "habitflow-empty-body"

    /** The page's main padding plus its inner container's: (16 + 16) on a 393 phone. */
    val horizontalPadding = 32.dp

    val titleSize = 24.sp
    val titleLineHeight = 32.sp
    val titleHeight = 32.dp
    val titleWeight = FontWeight(700)

    val headerPaddingBottom = 8.dp
    /** 8 padding plus the page's 1px transparent border. */
    val headerTrailing = 9.dp
    val listGap = 24.dp

    val countHeight = 22.dp
    val countPaddingX = 13.dp
    val countPaddingY = 3.dp
    val countTextSize = 12.sp
    val countLineHeight = 16.sp
    val countRadius = 50

    val emptyRadius = 24.dp
    val emptyPadding = 56.dp
    val emptyPaddingX = 24.dp
    /** 56 padding plus the page's 1px dashed border. */
    val emptyContentPadding = 57.dp
    /** 24 padding plus the same border. */
    val emptyContentPaddingX = 25.dp

    val iconTileSize = 64.dp
    val iconTileRadius = 16.dp
    val iconSize = 28.dp
    val iconToTitle = 20.dp

    val emptyTitleSize = 18.sp
    val emptyTitleLineHeight = 28.sp
    val emptyTitleHeight = 28.dp
    val emptyTitleWeight = FontWeight(700)

    val emptyBodySize = 14.sp
    val emptyBodyLineHeight = 22.75.sp
    /** Two lines at the page's 22.75 leading; Compose rounds each to a whole pixel. */
    val emptyBodyHeight = 45.5.dp
    val emptyBodyGap = 8.dp
}
