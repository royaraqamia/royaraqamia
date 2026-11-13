package com.royaraqamia.app.accountnews

import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.theme.RoyColors

/**
 * The page's own numbers for `/account/news` (#1347, ADR-0118).
 *
 * The site's two cards are Tailwind classes, and the port is measured against
 * them box by box: the title's 30px heading with its 46.5px line box, the
 * catalogue's `space-y-6` between groups and `gap-2` between rows, and the one
 * private list's `space-y-4` above its proposal field. Compose has no way to read
 * a resolved stylesheet back, so every number the gate measures is written here
 * and the cards draw with it. `shared/visual/account-news.json` is the contract
 * these values answer to; `NewsScreenVisualTest` records them.
 */
internal object AccountNewsMetrics {
    const val TITLE = "account-news-title"
    const val SOURCE_ROW = "account-news-source-row"
    const val PRIVATE = "account-news-private"
    const val PRIVATE_EMPTY = "account-news-private-empty"
    const val REQUEST = "account-news-request"

    /** The account layout's `px-4`; the measured width is 361 at the gate's 393. */
    val horizontalPadding = 16.dp

    // The heading: `SectionTitle` at `max-sm:text-3xl/[1.25]`, extrabold, and the
    // highlight span's vertical padding, which is why the box is 46.5 and not 37.5.
    val titleSize = 30.sp
    val titleLineHeight = 46.5.sp
    val titleHeight = 46.5.dp
    val titleWeight = FontWeight.ExtraBold
    val titleTracking = (-0.025).em
    val titleBrush: Brush
        get() =
            Brush.horizontalGradient(
                listOf(Color(0xFFA684FF), Color(0xFFED6AFF), Color(0xFF7C86FF))
            )

    /** `header.mb-10`: the page's `space-y-6` collapses into the larger margin. */
    val titleToPreferences = 40.dp

    // The catalogue: one section per category, `space-y-6` (24) between them.
    val groupGap = 24.dp
    val headingHeight = 20.dp
    val headingToRows = 8.dp
    val rowGap = 8.dp

    /** One source row: `rounded-2xl border px-4 py-3`, its two lines, and the border. */
    val rowHeight = 62.5.dp
    val rowRadius = 16.dp
    val rowPaddingHorizontal = 16.dp
    val rowPaddingVertical = 12.dp
    val rowBorder = 1.dp
    val sourceNameSize = 14.sp
    val sourceNameLineHeight = 20.sp
    val sourceRegionSize = 11.sp
    val sourceRegionLineHeight = 16.5.sp

    /** The actions row: the page's CTA is 48 tall on the app's phone. */
    val actionsTop = 24.dp
    val actionsHeight = 48.dp
    val actionsGap = 12.dp

    /**
     * The rule above the one private list: the page's `space-y-6`, its 1px
     * `border-t`, and the wrapper's `pt-6` are 49px between the two cards.
     */
    val preferencesToDivider = 24.dp
    val dividerToPrivate = 24.dp

    // The one private list: `space-y-4` (16) between its heading, field, rows.
    val privateGap = 16.dp
    val privateHeadingHeight = 24.dp
    val privateHeadingSize = 16.sp
    val privateHeadingLineHeight = 24.sp

    /** The proposal field's box: title, gap, label, gap, field, gap, CTA. */
    val requestHeight = 158.dp
    val requestTitleHeight = 20.dp
    val requestTitleSize = 14.sp
    val requestTitleLineHeight = 20.sp
    val requestTitleToForm = 12.dp
    val requestLabelHeight = 16.dp
    val requestLabelSize = 12.sp
    val requestLabelLineHeight = 16.sp
    val requestLabelToField = 6.dp
    val requestFieldHeight = 44.dp
    val requestFieldRadius = 12.dp
    val requestFieldPaddingHorizontal = 14.dp
    val requestValueSize = 14.sp
    val requestValueLineHeight = 20.sp
    val requestFormToButton = 12.dp
    val requestButtonHeight = 48.dp

    /** One owned row: two lines, `p-3`, the 40px delete control, and the border. */
    val ownedRowHeight = 66.dp
    val ownedRowPadding = 12.dp
    val ownedNameSize = 14.sp
    val ownedNameLineHeight = 20.sp
    val ownedUrlSize = 11.sp
    val ownedUrlLineHeight = 20.sp

    /** The empty sentence: `p-4`, `text-sm`, two lines at the gate's width. */
    val emptyHeight = 74.dp
    val emptyPadding = 16.dp
    val emptySize = 14.sp
    val emptyLineHeight = 20.sp

    val cardRadius = 16.dp
    val cardBorder = 1.dp
    val cardSurface: Color get() = RoyColors.card.copy(alpha = 0.6f)
}
