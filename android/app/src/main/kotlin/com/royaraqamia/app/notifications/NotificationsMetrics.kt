package com.royaraqamia.app.notifications

import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.theme.RoyColors

/**
 * The notification centre's own numbers for `/notifications` (#1391, ADR-0118).
 *
 * The page's row is Tailwind classes, and the port is measured against it box by
 * box: the list's `rounded-2xl` and 1px border, the row's `px-4 py-3.5`, the
 * icon's `rounded-xl p-2.5`, the title's `text-sm leading-snug`, the body's
 * `text-xs leading-relaxed` and the time's `text-[11px]`. Compose cannot read a
 * resolved stylesheet back, so every number the gate measures is written here
 * and `NotificationsScreen` draws with it. `shared/visual/notifications.json` is
 * the contract these values answer to; `NotificationsScreenVisualTest` records
 * them.
 */
internal object NotificationsMetrics {
    const val LIST = "notifications-list"
    const val ROW = "notification-row"
    const val ICON = "notification-icon"
    const val TITLE = "notification-title"
    const val BODY = "notification-body"
    const val TIME = "notification-time"
    const val UNREAD = "notification-unread"
    const val DELETE = "notification-delete"
    const val EMPTY = "notifications-empty"

    /** The page's `px-4` on the main column: the list is 361 wide at 393. */
    val horizontalPadding = 16.dp

    val listRadius = 16.dp
    val listBorder = 1.dp

    /** One row: `px-4 py-3.5`, with `pe-8` keeping the text clear of the delete. */
    val rowPaddingHorizontal = 16.dp
    val rowPaddingVertical = 14.dp
    val rowEndPadding = 32.dp

    /** The icon box: `p-2.5` around an 18px glyph, `rounded-xl`. */
    val iconSize = 38.dp
    val iconRadius = 12.dp
    val glyphSize = 18.dp
    val iconGap = 14.dp

    /** The text column's `pt-0.5`. */
    val textTop = 2.dp

    val titleSize = 14.sp
    val titleLineHeight = 19.5.sp
    val titleWeightUnread = FontWeight.Bold
    val titleWeightRead = FontWeight.Medium

    val bodyTop = 4.dp
    val bodySize = 12.sp
    val bodyLineHeight = 22.5.sp

    val timeTop = 6.dp
    val timeSize = 11.sp
    val timeLineHeight = 17.6.sp

    /**
     * CSS gives a single line of text its line box; Compose gives it the font's
     * metrics, which are shorter. The time is always one line, so its box is
     * pinned to the page's 17.6px line box rather than left to the font.
     */
    val timeHeight = 17.6.dp

    /** `h-2 w-2` with a 4px ring, and the row's own 3px inset for `top-3`. */
    val unreadDot = 8.dp
    val unreadRing = 4.dp
    val deleteTop = 12.dp
    val deleteEnd = 12.dp
    val deleteSize = 26.dp
    val deleteRadius = 8.dp
    val deleteGlyphSize = 14.dp

    /** The page's one empty frame: `px-4 py-14`, `rounded-2xl`. */
    val panelRadius = 16.dp
    /** The page's empty frame is 220 tall at the gate's phone. */
    val panelHeight = 220.dp
    val panelPaddingHorizontal = 16.dp
    val panelPaddingVertical = 56.dp
    val panelIconPadding = 14.dp
    val panelIconGlyph = 24.dp
    val panelIconGap = 12.dp
    val panelTitleSize = 14.sp
    val panelTitleLineHeight = 20.sp
    val panelBodyTop = 4.dp
    val panelBodySize = 12.sp
    val panelBodyLineHeight = 16.sp

    val cardSurface: Color get() = RoyColors.card.copy(alpha = 0.6f)
    val listBorderColor: Color get() = RoyColors.border.copy(alpha = 0.7f)
    val rowDivider: Color get() = RoyColors.border.copy(alpha = 0.4f)
    val rowUnreadSurface: Color get() = RoyColors.primary.copy(alpha = 0.08f)
    val iconReadSurface: Color get() = RoyColors.muted.copy(alpha = 0.8f)
    val iconUnreadSurface: Color get() = RoyColors.primary.copy(alpha = 0.1f)
    val iconUnreadRing: Color get() = RoyColors.primary.copy(alpha = 0.2f)
}
