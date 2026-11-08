package com.royaraqamia.app.linksnap

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.DropdownMenu
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * The owned-link row's toolbar (#943), ported from
 * `frontend/ui/linksnap/link-row-card.tsx`.
 *
 * The page draws copy and share as icon buttons, the analytics toggle beside
 * them, and edit, QR and delete in an overflow menu. The same actions live here,
 * with the same words: [LinksnapRowActionsCopy] is generated from the source the
 * page reads (ADR-0098). The toolbar owns the delete confirmation because the
 * page's row owns it; the screen above decides what the write is.
 *
 * The action the page draws as a drawer - analytics (#918) - is handed to the
 * caller, which hands the route to the document until that slice draws it
 * natively. Edit (#944) and QR (#943) are the dialogs in [LinksnapEditDialog]
 * and [LinksnapQrDialog].
 */
@Composable
internal fun LinksnapRowActions(
    code: String,
    copied: Boolean,
    analyticsExpanded: Boolean,
    onCopy: () -> Unit,
    onShare: () -> Unit,
    onAnalytics: () -> Unit,
    onEdit: () -> Unit,
    onQr: () -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    var menuOpen by remember { mutableStateOf(false) }
    var confirmOpen by remember { mutableStateOf(false) }

    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .testTag(LinksnapRowActionMetrics.TOOLBAR)
                .padding(top = LinksnapRowActionMetrics.toolbarTopPadding),
        horizontalArrangement =
            Arrangement.spacedBy(LinksnapRowActionMetrics.gap, Alignment.End),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ActionIcon(
            tag = LinksnapRowActionMetrics.COPY,
            icon = if (copied) LucideVectors.Check else LucideVectors.Copy,
            label = LinksnapRowActionsCopy.COPY_ACTION,
            tint = if (copied) RoyColors.success else RoyColors.mutedForeground,
            onClick = onCopy,
        )
        ActionIcon(
            tag = LinksnapRowActionMetrics.SHARE,
            icon = LucideVectors.Share2,
            label = LinksnapRowActionsCopy.SHARE_ACTION,
            onClick = onShare,
        )
        AnalyticsButton(expanded = analyticsExpanded, onClick = onAnalytics)
        Box {
            ActionIcon(
                tag = LinksnapRowActionMetrics.MENU,
                icon = LucideVectors.Ellipsis,
                label = "${LinksnapRowActionsCopy.ACTIONS_MENU} /$code",
                onClick = { menuOpen = true },
            )
            DropdownMenu(expanded = menuOpen, onDismissRequest = { menuOpen = false }) {
                MenuItem(
                    tag = LinksnapRowActionMetrics.EDIT,
                    icon = LucideVectors.Pencil,
                    label = LinksnapRowActionsCopy.EDIT_ACTION,
                    onClick = {
                        menuOpen = false
                        onEdit()
                    },
                )
                MenuItem(
                    tag = LinksnapRowActionMetrics.QR,
                    icon = LucideVectors.QrCode,
                    label = LinksnapRowActionsCopy.QR_ACTION,
                    onClick = {
                        menuOpen = false
                        onQr()
                    },
                )
                MenuItem(
                    tag = LinksnapRowActionMetrics.DELETE,
                    icon = LucideVectors.Trash,
                    label = LinksnapRowActionsCopy.DELETE_ACTION,
                    destructive = true,
                    onClick = {
                        menuOpen = false
                        confirmOpen = true
                    },
                )
            }
        }
    }

    if (confirmOpen) {
        androidx.compose.material3.AlertDialog(
            onDismissRequest = { confirmOpen = false },
            icon = {
                Icon(
                    imageVector = LucideVectors.TriangleAlert,
                    contentDescription = null,
                    modifier = Modifier.size(LinksnapRowActionMetrics.menuIconSize),
                    tint = RoyColors.destructive,
                )
            },
            title = {
                Text(
                    text = LinksnapRowActionsCopy.DELETE_TITLE,
                    style = LinksnapRowActionMetrics.text.copy(fontWeight = FontWeight.Bold),
                )
            },
            text = {
                Text(
                    text = LinksnapRowActionsCopy.DELETE_MESSAGE,
                    style = LinksnapRowActionMetrics.text.copy(color = RoyColors.mutedForeground),
                )
            },
            confirmButton = {
                TextButton(
                    onClick = {
                        confirmOpen = false
                        onDelete()
                    }
                ) {
                    Text(
                        text = LinksnapRowActionsCopy.DELETE_CONFIRM,
                        style =
                            LinksnapRowActionMetrics.text.copy(
                                color = RoyColors.destructive,
                                fontWeight = FontWeight.Bold,
                            ),
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmOpen = false }) {
                    Text(
                        text = LinksnapRowActionsCopy.DELETE_CANCEL,
                        style = LinksnapRowActionMetrics.text,
                    )
                }
            },
            containerColor = RoyColors.card,
        )
    }
}

@Composable
private fun ActionIcon(
    tag: String,
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    tint: Color = RoyColors.mutedForeground,
) {
    Box(
        modifier =
            Modifier.testTag(tag)
                .size(LinksnapRowActionMetrics.buttonSize)
                .clip(RoundedCornerShape(LinksnapRowActionMetrics.buttonRadius))
                .background(RoyColors.card)
                .border(
                    LinksnapRowActionMetrics.borderWidth,
                    RoyColors.border,
                    RoundedCornerShape(LinksnapRowActionMetrics.buttonRadius),
                )
                .clickable(onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = label,
            modifier = Modifier.size(LinksnapRowActionMetrics.iconSize),
            tint = tint,
        )
    }
}

@Composable
private fun AnalyticsButton(expanded: Boolean, onClick: () -> Unit) {
    Row(
        modifier =
            Modifier.testTag(LinksnapRowActionMetrics.ANALYTICS)
                .height(LinksnapRowActionMetrics.buttonSize)
                .clip(RoundedCornerShape(LinksnapRowActionMetrics.buttonRadius))
                .background(if (expanded) RoyColors.foreground else RoyColors.card)
                .border(
                    LinksnapRowActionMetrics.borderWidth,
                    if (expanded) RoyColors.foreground else RoyColors.border,
                    RoundedCornerShape(LinksnapRowActionMetrics.buttonRadius),
                )
                .clickable(onClick = onClick)
                .padding(horizontal = LinksnapRowActionMetrics.analyticsPaddingX),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(LinksnapRowActionMetrics.iconGap),
    ) {
        Icon(
            imageVector = LucideVectors.ChartColumn,
            contentDescription = LinksnapRowActionsCopy.ANALYTICS_ACTION,
            modifier = Modifier.size(LinksnapRowActionMetrics.analyticsIconSize),
            tint = if (expanded) RoyColors.background else RoyColors.mutedForeground,
        )
        Icon(
            imageVector =
                if (expanded) LucideVectors.ChevronUp else LucideVectors.ChevronDown,
            contentDescription = null,
            modifier = Modifier.size(LinksnapRowActionMetrics.chevronSize),
            tint = if (expanded) RoyColors.background else RoyColors.mutedForeground,
        )
    }
}

@Composable
private fun MenuItem(
    tag: String,
    icon: ImageVector,
    label: String,
    onClick: () -> Unit,
    destructive: Boolean = false,
) {
    DropdownMenuItem(
        modifier = Modifier.testTag(tag),
        text = {
            Text(
                text = label,
                modifier = Modifier.padding(start = LinksnapRowActionMetrics.menuIconGap),
                style =
                    LinksnapRowActionMetrics.text.copy(
                        color = if (destructive) RoyColors.destructive else RoyColors.foreground,
                        fontWeight = FontWeight.Medium,
                    ),
            )
        },
        leadingIcon = {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(LinksnapRowActionMetrics.menuIconSize),
                tint = if (destructive) RoyColors.destructive else RoyColors.mutedForeground,
            )
        },
        onClick = onClick,
    )
}

/**
 * The toolbar's page numbers. It is not a measured box in the visual gate: the
 * gate's `qr` state measures the dialog the QR action opens, and the toolbar's
 * own geometry is read from the same `h-9 w-9 rounded-xl` the page draws.
 */
internal object LinksnapRowActionMetrics {
    const val TOOLBAR = "linksnap-row-actions"
    const val COPY = "linksnap-row-copy"
    const val SHARE = "linksnap-row-share"
    const val ANALYTICS = "linksnap-row-analytics"
    const val MENU = "linksnap-row-menu"
    const val EDIT = "linksnap-row-edit"
    const val QR = "linksnap-row-qr"
    const val DELETE = "linksnap-row-delete"

    val toolbarTopPadding = 8.dp
    val gap = 8.dp
    val buttonSize = 36.dp
    val buttonRadius = 12.dp
    val borderWidth = 1.dp
    val iconSize = 16.dp
    val analyticsIconSize = 14.dp
    val chevronSize = 14.dp
    val analyticsPaddingX = 14.dp
    val iconGap = 6.dp
    val menuIconSize = 16.dp
    val menuIconGap = 8.dp

    val textLineHeight = 20.sp
    val text = TextStyle(fontSize = 13.sp, lineHeight = textLineHeight)
}
