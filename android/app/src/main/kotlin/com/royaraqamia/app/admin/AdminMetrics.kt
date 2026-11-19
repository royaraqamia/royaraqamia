package com.royaraqamia.app.admin

import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/**
 * The console index's measured design (#1627, ADR-0118).
 *
 * These are the numbers `shared/visual/admin.json` measures on `/admin` at 393 x
 * 852 CSS px, at the DPR the app composes at. The screen draws with them and the
 * visual test reads them back, so a number in `app.json` is the style the screen
 * actually used rather than a second copy kept in a test.
 *
 * The card's vertical padding is 21dp rather than the page's 20px: the page's
 * 1px border sits outside its padding box, while Compose draws a border inside
 * the measured bounds. The extra pixel on each side is what makes the composed
 * card the page's 88.75dp high instead of 86.75dp.
 */
internal object AdminMetrics {
    const val TITLE = "admin-title"
    const val LIST = "admin-sections"

    fun section(id: String): String = "admin-section-$id"

    val screenPaddingX = 16.dp
    val screenPaddingY = 12.dp

    val titleHeight = 46.5.dp
    val titleLineHeight = 37.5.sp
    val titleSize = 30.sp
    val titleWeight = FontWeight(800)
    val titleToList = 24.dp

    val listGap = 12.dp

    val cardRadius = 16.dp
    val cardBorder = 1.dp
    val cardPaddingX = 20.dp
    val cardPaddingY = 21.dp
    val cardGap = 14.dp

    val iconBox = 44.dp
    val iconRadius = 12.dp
    val iconSize = 20.dp
    val arrowSize = 16.dp

    val labelSize = 14.sp
    val labelLineHeight = 20.sp
    val labelWeight = FontWeight(700)
    val labelBodyGap = 4.dp

    val descriptionSize = 14.sp
    val descriptionLineHeight = 22.75.sp
}
