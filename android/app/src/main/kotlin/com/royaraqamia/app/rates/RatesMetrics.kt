package com.royaraqamia.app.rates

import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * The page's numbers for `/rates`, as one source the screen and its visual test
 * both read (#897, ADR-0118).
 *
 * They are what the page resolves to at 393 x 852: the 30/800 title in its 46.5
 * box, 20 down to the 16-high board line, 40 on to the converter card, its 24
 * padding inside a 1px border, the 44-high fields at radius 12, the 89.19-high
 * result box, then the metals heading 28 high and its card 16 below it. Keeping
 * them here rather than inline is what lets the test measure the numbers the screen
 * draws, so a change to one without the other fails `check:visual` instead of
 * drifting quietly.
 */
internal object RatesMetrics {
    const val TITLE = "rates-title"
    const val BOARD = "rates-board"
    const val CONVERTER = "rates-converter"
    const val AMOUNT = "rates-amount"
    const val FROM = "rates-from"
    const val TO = "rates-to"
    const val RESULT = "rates-result"
    const val METALS_TITLE = "rates-metals-title"
    const val METALS_CARD = "rates-metals-card"

    val horizontalPadding = 16.dp

    val titleSize = 30.sp
    val titleLineHeight = 37.5.sp
    val titleHeight = 46.5.dp
    val titleWeight = FontWeight(800)
    val titleToBoard = 20.dp

    val boardHeight = 16.dp
    val boardTextSize = 12.sp
    val boardTextLineHeight = 16.sp
    val boardToConverter = 40.dp

    val cardRadius = 24.dp
    val cardPadding = 24.dp
    /** The page's padding plus the 1px border Compose paints without consuming. */
    val cardContentPadding = 25.dp

    val sectionGap = 40.dp

    val labelHeight = 20.dp
    val labelTextSize = 14.sp
    val labelLineHeight = 20.sp
    val labelGap = 12.dp

    val fieldHeight = 44.dp
    val fieldRadius = 12.dp
    val fieldTextSize = 14.sp
    val fieldPadding = 14.dp
    val selectPadding = 16.dp
    val fieldGap = 16.dp
    val swapSize = 44.dp

    val resultGap = 24.dp
    val resultRadius = 16.dp
    val resultPadding = 24.dp
    val resultFigureHeight = 39.19.dp
    val resultFigureSize = 24.sp
    val resultFigureLineHeight = 32.sp
    val resultSymbolSize = 13.2.sp
    val resultNoteSize = 12.sp
    val resultNoteGap = 8.dp

    val metalsTitleSize = 20.sp
    val metalsTitleLineHeight = 28.sp
    val metalsTitleHeight = 28.dp
    val metalsTitleToCard = 16.dp

    val choiceLabelGap = 6.dp
    // The page's 42px track lands between device pixels at 2.75 (115.5), and
    // Compose rounds it up to 116. 41.8 measures 115, the nearest whole pixel, so
    // the two choice rows keep the metals card at the page's own height.
    val trackHeight = 41.8.dp
    val trackRadius = 12.dp
    val trackPadding = 4.dp
    val trackBorder = 1.dp
    val trackItemHeight = 32.dp
    val trackItemRadius = 8.dp
}
