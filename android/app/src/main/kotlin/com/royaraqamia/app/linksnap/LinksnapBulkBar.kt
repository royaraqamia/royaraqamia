package com.royaraqamia.app.linksnap

import android.app.DatePickerDialog
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors
import java.time.LocalDate

/**
 * The owned list's bulk bar (#942), ported from
 * `frontend/ui/linksnap/bulk-action-bar.tsx`.
 *
 * The page draws the bar as one flex row that wraps at 393: select-all, the
 * count and the spacer share the first line with clear and copy, and expiry and
 * delete wrap to the second. The two lines are drawn explicitly here so the
 * wrap is the design rather than a measurement the app might round differently.
 * Every visible word is [LinksnapBulkBarCopy], generated from the same source
 * the page reads (ADR-0098).
 *
 * The bar owns the delete confirmation and the date picker because the page's
 * bar owns them: the strings stay in the one component the pair names, and the
 * screen above only decides what the write is.
 */
@Composable
internal fun LinksnapBulkBar(
    total: Int,
    selectedCount: Int,
    allSelected: Boolean,
    busy: Boolean,
    onToggleAll: () -> Unit,
    onClear: () -> Unit,
    onCopy: () -> Unit,
    onApplyExpiry: (String) -> Unit,
    onDelete: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    var confirmOpen by remember { mutableStateOf(false) }
    val enabled = selectedCount > 0 && !busy

    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .height(LinksnapBulkBarMetrics.height)
                .testTag(LinksnapBulkBarMetrics.BAR)
                .clip(RoundedCornerShape(LinksnapBulkBarMetrics.radius))
                .background(RoyColors.card.copy(alpha = 0.9f))
                .border(
                    LinksnapBulkBarMetrics.borderWidth,
                    RoyColors.border,
                    RoundedCornerShape(LinksnapBulkBarMetrics.radius),
                )
                .padding(LinksnapBulkBarMetrics.padding),
        verticalArrangement = Arrangement.spacedBy(LinksnapBulkBarMetrics.gap),
    ) {
        Row(
            modifier =
                Modifier.fillMaxWidth().height(LinksnapBulkBarMetrics.firstLineHeight),
            horizontalArrangement = Arrangement.spacedBy(LinksnapBulkBarMetrics.gap),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            SelectAll(allSelected = allSelected, onToggleAll = onToggleAll)
            Count(total = total, selectedCount = selectedCount)
            Spacer(Modifier.weight(1f))
            BulkButton(
                tag = LinksnapBulkBarMetrics.CLEAR,
                label = LinksnapBulkBarCopy.CLEAR,
                enabled = enabled,
                muted = true,
                onClick = onClear,
            )
            BulkButton(
                tag = LinksnapBulkBarMetrics.COPY,
                label = LinksnapBulkBarCopy.COPY,
                icon = LucideVectors.Copy,
                enabled = enabled,
                onClick = onCopy,
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth().height(LinksnapBulkBarMetrics.buttonHeight),
            horizontalArrangement = Arrangement.spacedBy(LinksnapBulkBarMetrics.gap),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            BulkButton(
                tag = LinksnapBulkBarMetrics.EXPIRY,
                label = LinksnapBulkBarCopy.EXPIRY,
                icon = LucideVectors.Calendar,
                enabled = enabled,
                onClick = {
                    // The page's bar owns the picker too; the chosen calendar day
                    // becomes the instant the write carries, a moment later.
                    val today = LocalDate.now()
                    DatePickerDialog(
                            context,
                            { _, year, month, day ->
                                onApplyExpiry(LocalDate.of(year, month + 1, day).toString())
                            },
                            today.year,
                            today.monthValue - 1,
                            today.dayOfMonth,
                        )
                        .show()
                },
            )
            BulkButton(
                tag = LinksnapBulkBarMetrics.DELETE,
                label = LinksnapBulkBarCopy.DELETE,
                icon = LucideVectors.Trash,
                enabled = enabled,
                destructive = true,
                onClick = { confirmOpen = true },
            )
        }
    }

    if (confirmOpen) {
        AlertDialog(
            onDismissRequest = { confirmOpen = false },
            title = {
                Text(
                    text = LinksnapBulkBarCopy.DELETE_TITLE,
                    style = LinksnapBulkBarMetrics.text.copy(fontWeight = FontWeight.Bold),
                )
            },
            text = {
                Text(
                    text =
                        LinksnapBulkBarCopy.DELETE_MESSAGE.replace(
                            "{count}",
                            selectedCount.toString(),
                        ),
                    style = LinksnapBulkBarMetrics.text,
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
                        text = LinksnapBulkBarCopy.DELETE_CONFIRM,
                        style = LinksnapBulkBarMetrics.text.copy(fontWeight = FontWeight.Bold),
                    )
                }
            },
            dismissButton = {
                TextButton(onClick = { confirmOpen = false }) {
                    Text(
                        text = LinksnapBulkBarCopy.DELETE_CANCEL,
                        style = LinksnapBulkBarMetrics.text,
                    )
                }
            },
            containerColor = RoyColors.card,
        )
    }
}

@Composable
private fun SelectAll(allSelected: Boolean, onToggleAll: () -> Unit) {
    Row(
        modifier =
            Modifier.testTag(LinksnapBulkBarMetrics.SELECT_ALL)
                .height(LinksnapBulkBarMetrics.firstLineHeight)
                .clip(RoundedCornerShape(LinksnapBulkBarMetrics.checkboxRadius))
                .clickable(onClick = onToggleAll)
                .padding(horizontal = LinksnapBulkBarMetrics.selectPadding),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(LinksnapBulkBarMetrics.selectGap),
    ) {
        Box(
            modifier =
                Modifier.testTag(LinksnapBulkBarMetrics.CHECKBOX)
                    .size(LinksnapBulkBarMetrics.checkboxSize)
                    .clip(RoundedCornerShape(LinksnapBulkBarMetrics.checkboxRadius))
                    .background(if (allSelected) RoyColors.primary else Color.Transparent)
                    .border(
                        LinksnapBulkBarMetrics.borderWidth,
                        if (allSelected) RoyColors.primary
                        else RoyColors.mutedForeground.copy(alpha = 0.4f),
                        RoundedCornerShape(LinksnapBulkBarMetrics.checkboxRadius),
                    ),
            contentAlignment = Alignment.Center,
        ) {
            if (allSelected) {
                Icon(
                    imageVector = LucideVectors.Check,
                    contentDescription = null,
                    modifier = Modifier.size(LinksnapBulkBarMetrics.checkIconSize),
                    tint = RoyColors.primaryForeground,
                )
            }
        }
        Text(
            text = LinksnapBulkBarCopy.SELECT_ALL,
            style =
                LinksnapBulkBarMetrics.text.copy(
                    color = RoyColors.foreground,
                    fontWeight = FontWeight.Bold,
                ),
            maxLines = 1,
        )
    }
}

@Composable
private fun Count(total: Int, selectedCount: Int) {
    val text =
        if (selectedCount > 0) {
            LinksnapBulkBarCopy.COUNT_SELECTED
                .replace("{selected}", selectedCount.toString())
                .replace("{total}", total.toString())
        } else {
            LinksnapBulkBarCopy.COUNT_TOTAL.replace("{total}", total.toString())
        }
    Text(
        text = text,
        modifier = Modifier.testTag(LinksnapBulkBarMetrics.COUNT),
        style = LinksnapBulkBarMetrics.text.copy(color = RoyColors.mutedForeground),
        maxLines = 1,
    )
}

@Composable
private fun BulkButton(
    tag: String,
    label: String,
    enabled: Boolean,
    onClick: () -> Unit,
    icon: ImageVector? = null,
    muted: Boolean = false,
    destructive: Boolean = false,
) {
    val content =
        when {
            destructive -> RoyColors.destructive
            muted -> RoyColors.mutedForeground
            else -> RoyColors.foreground
        }
    val border =
        when {
            destructive -> RoyColors.destructive.copy(alpha = 0.3f)
            else -> RoyColors.border
        }
    Row(
        modifier =
            Modifier.testTag(tag)
                .height(LinksnapBulkBarMetrics.buttonHeight)
                .alpha(if (enabled) 1f else 0.4f)
                .clip(RoundedCornerShape(LinksnapBulkBarMetrics.buttonRadius))
                .background(
                    if (destructive) RoyColors.destructive.copy(alpha = 0.1f) else Color.Transparent
                )
                .border(
                    LinksnapBulkBarMetrics.borderWidth,
                    border,
                    RoundedCornerShape(LinksnapBulkBarMetrics.buttonRadius),
                )
                .clickable(enabled = enabled, onClick = onClick)
                .padding(horizontal = LinksnapBulkBarMetrics.buttonPaddingX),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(LinksnapBulkBarMetrics.buttonGap),
    ) {
        icon?.let {
            Icon(
                imageVector = it,
                contentDescription = null,
                modifier = Modifier.size(LinksnapBulkBarMetrics.iconSize),
                tint = content,
            )
        }
        Text(
            text = label,
            style =
                LinksnapBulkBarMetrics.text.copy(
                    color = content,
                    fontWeight = FontWeight.Bold,
                ),
            maxLines = 1,
        )
    }
}

/**
 * The bulk bar's page numbers, which the visual gate compares box by box
 * (`shared/visual/account-links.json`, ADR-0118).
 *
 * [designPadding] and [designButtonPaddingTop] are the page's own CSS values,
 * which is what the contract measures; [padding] is one dp larger because
 * Compose draws its border inside the bounds where the page's border sits
 * outside its padding.
 */
internal object LinksnapBulkBarMetrics {
    const val BAR = "linksnap-bulk-bar"
    const val SELECT_ALL = "linksnap-bulk-select-all"
    const val CHECKBOX = "linksnap-bulk-checkbox"
    const val COUNT = "linksnap-bulk-count"
    const val CLEAR = "linksnap-bulk-clear"
    const val COPY = "linksnap-bulk-copy"
    const val EXPIRY = "linksnap-bulk-expiry"
    const val DELETE = "linksnap-bulk-delete"

    const val designPadding = 12
    const val designButtonPaddingTop = 6

    val padding = 13.dp
    val height = 112.dp
    val radius = 12.dp
    val borderWidth = 1.dp
    val gap = 12.dp
    val firstLineHeight = 44.dp

    val selectPadding = 4.dp
    val selectGap = 8.dp
    val checkboxSize = 18.dp
    val checkboxRadius = 4.dp
    val checkIconSize = 12.dp

    val buttonHeight = 30.dp
    val buttonRadius = 8.dp
    val buttonPaddingX = 10.dp
    val buttonGap = 6.dp
    val iconSize = 14.dp

    val textSize = 12.sp
    val lineHeight = 16.sp
    val text =
        TextStyle(
            fontSize = textSize,
            lineHeight = lineHeight,
            fontWeight = FontWeight.Bold,
        )
}
