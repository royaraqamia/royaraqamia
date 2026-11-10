package com.royaraqamia.app.shell

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.paneTitle
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * What a picker row's action is showing (#1194, ADR-0146).
 *
 * [Add] is the site's violet "add this app"; [Remove] is its emerald "it is on
 * your homepage", with a tick. The names are the parity row's states, so a state
 * one client can draw and the other cannot is visible to `check:parity` rather
 * than to a user. A refused write is the sheet's line, not a row state.
 */
sealed interface PickerRowState {
    data object Add : PickerRowState

    data object Remove : PickerRowState
}

/** The site's Tailwind palette for the picker, which the token set does not name. */
private object PickerColors {
    val Violet200 = Color(0xFFDDD6FE)
    val Violet500 = Color(0xFF8B5CF6)
    val Emerald300 = Color(0xFF6EE7B7)
    val Emerald500 = Color(0xFF10B981)
    val Red300 = Color(0xFFFCA5A5)
    val Divider = Color(0xFF262626)
}

/** The picker's own geometry, read from the page's classes (ADR-0118). */
internal object PickerMetrics {
    val rowHorizontalPadding = 16.dp
    val rowVerticalPadding = 4.dp
    val rowHeight = 53.dp
    val lastRowHeight = 52.dp
    val listPaddingHorizontal = 6.dp

    /** The site's sheet border and the header's hairline: two rows above the list's own padding. */
    val topRules = 2.dp
    val listPaddingBottom = 6.dp
    val rowActionMinHeight = 36.dp
    val rowActionMinWidth = 80.dp
    val rowActionHorizontalPadding = 12.dp
    val rowActionTextSize = 12.sp
    val actionGap = 6.dp
    val checkSize = 14.dp
    val iconSize = 16.dp
    val iconGap = 10.dp
    val labelTextSize = 14.sp
    val labelVerticalPadding = 12.dp
    val errorTopPadding = 8.dp
    val errorTextSize = 12.sp
    val borderWidth = 1.dp
    val sheetRadius = 16.dp
}

/**
 * The app picker as a bottom sheet (#1194, ADR-0146).
 *
 * A row is not a link any more: the sheet is the picker, so pressing its action
 * adds or removes the app and the sheet stays open for the next choice. It is
 * the same sheet the top bar's `تطبيقاتنا` and the homepage strip's end control
 * open on the site, drawn from the site's numbers: a 16dp top radius, no grabber
 * and no visible title (ADR-0153), hairline-separated rows, and an action pill
 * that is violet to add and emerald with a tick once the app is on the homepage.
 *
 * The sheet owns its dismissal (scrim tap, back); the caller owns the list. A
 * refused write is the sheet's own line under its rows, cleared by the next
 * attempt, so no row claims a state the server did not keep.
 */
@Composable
fun ServicesSheet(
    open: Boolean,
    order: List<String>,
    busy: String?,
    error: String?,
    onToggle: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    if (!open) return

    // A sheet is a screen while it is open: back closes it rather than walking the
    // route underneath (ADR-0082).
    BackHandler(enabled = true, onBack = onDismiss)

    val ruleTop = MaterialTheme.colorScheme.outline.copy(alpha = 0.6f)
    val ruleHeader = MaterialTheme.colorScheme.outline.copy(alpha = 0.4f)

    Box(Modifier.fillMaxSize()) {
        // `bg-black/75`, the scrim the site's sheets draw.
        Box(
            Modifier.fillMaxSize()
                .background(Color.Black.copy(alpha = 0.75f))
                .pointerInput(Unit) { detectTapGestures { onDismiss() } }
        )
        Surface(
            modifier =
                Modifier.align(Alignment.BottomCenter)
                    .fillMaxWidth()
                    .testTag("services-sheet")
                    .semantics { paneTitle = ServicesSheetCopy.TITLE },
            shape =
                RoundedCornerShape(
                    topStart = PickerMetrics.sheetRadius,
                    topEnd = PickerMetrics.sheetRadius,
                ),
            color = MaterialTheme.colorScheme.surface,
        ) {
            Column(
                Modifier.fillMaxWidth()
                    .navigationBarsPadding()
                    .drawBehind {
                        val line = 1.dp.toPx()
                        // The sheet's own `border-t` and the header's hairline: the
                        // page's first row starts two pixels into the sheet, and the
                        // raster carries both lines.
                        drawRect(
                            color = ruleTop,
                            size = Size(size.width, line),
                        )
                        drawRect(
                            color = ruleHeader,
                            topLeft = Offset(0f, line),
                            size = Size(size.width, line),
                        )
                    }
                    .padding(
                        start = PickerMetrics.listPaddingHorizontal,
                        end = PickerMetrics.listPaddingHorizontal,
                        top = PickerMetrics.topRules + PickerMetrics.listPaddingHorizontal,
                        bottom = PickerMetrics.listPaddingBottom,
                    )
            ) {
                ServicesEntry.rows.forEachIndexed { index, entry ->
                    PickerRow(
                        entry = entry,
                        added = entry.route in order,
                        pending = busy == entry.route,
                        enabled = busy == null,
                        last = index == ServicesEntry.rows.lastIndex,
                        onToggle = { onToggle(entry.route) },
                    )
                }

                // The page's line is a block that only has its top padding when
                // there is nothing to say (whitespace collapses), so the empty
                // sheet is 16px shorter than the one drawing a refusal.
                if (error == null) {
                    Spacer(Modifier.height(PickerMetrics.errorTopPadding))
                } else {
                    Text(
                        text = error,
                        style =
                            MaterialTheme.typography.labelSmall.copy(
                                fontSize = PickerMetrics.errorTextSize,
                                lineHeight = 16.sp,
                            ),
                        color = PickerColors.Red300,
                        modifier =
                            Modifier.fillMaxWidth()
                                .padding(
                                    top = PickerMetrics.errorTopPadding,
                                    start = PickerMetrics.rowHorizontalPadding,
                                    end = PickerMetrics.rowHorizontalPadding,
                                ),
                        maxLines = 2,
                        textAlign = TextAlign.Center,
                    )
                }
            }
        }
    }
}

@Composable
private fun PickerRow(
    entry: ServicesEntry,
    added: Boolean,
    pending: Boolean,
    enabled: Boolean,
    last: Boolean,
    onToggle: () -> Unit,
) {
    Row(
        modifier =
            Modifier.fillMaxWidth()
                .height(if (last) PickerMetrics.lastRowHeight else PickerMetrics.rowHeight)
                .testTag("services-row")
                .bottomHairline(last)
                .padding(
                    horizontal = PickerMetrics.rowHorizontalPadding,
                    vertical = PickerMetrics.rowVerticalPadding,
                ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Row(
            modifier =
                Modifier.weight(1f).padding(vertical = PickerMetrics.labelVerticalPadding),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(PickerMetrics.iconGap),
        ) {
            Icon(
                imageVector = iconOf(entry),
                contentDescription = null,
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier.size(PickerMetrics.iconSize),
            )
            Text(
                text = labelOf(entry),
                style =
                    MaterialTheme.typography.bodyMedium.copy(
                        fontSize = PickerMetrics.labelTextSize,
                        fontWeight = FontWeight.Medium,
                    ),
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1,
            )
        }

        PickerAction(
            state = if (added) PickerRowState.Remove else PickerRowState.Add,
            pending = pending,
            enabled = enabled,
            onToggle = onToggle,
        )
    }
}

/** The site's action pill, in its two colours. */
@Composable
private fun PickerAction(
    state: PickerRowState,
    pending: Boolean,
    enabled: Boolean,
    onToggle: () -> Unit,
) {
    val added = state is PickerRowState.Remove
    val shape = RoundedCornerShape(percent = 50)

    Row(
        modifier =
            Modifier.heightIn(min = PickerMetrics.rowActionMinHeight)
                .widthIn(min = PickerMetrics.rowActionMinWidth)
                .clip(shape)
                .background(
                    if (added) {
                        PickerColors.Emerald500.copy(alpha = 0.10f)
                    } else {
                        PickerColors.Violet500.copy(alpha = 0.15f)
                    }
                )
                .border(
                    width = PickerMetrics.borderWidth,
                    color =
                        if (added) {
                            PickerColors.Emerald500.copy(alpha = 0.40f)
                        } else {
                            PickerColors.Violet500.copy(alpha = 0.40f)
                        },
                    shape = shape,
                )
                .toggleable(
                    value = added,
                    enabled = enabled && !pending,
                    role = Role.Button,
                    onValueChange = { onToggle() },
                )
                .testTag("services-row-action")
                .padding(horizontal = PickerMetrics.rowActionHorizontalPadding),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
    ) {
        if (added) {
            Icon(
                imageVector = LucideVectors.Check,
                contentDescription = null,
                tint = PickerColors.Emerald300,
                modifier = Modifier.size(PickerMetrics.checkSize),
            )
            Spacer(Modifier.size(PickerMetrics.actionGap))
        }
        Text(
            text = labelOf(state),
            style =
                MaterialTheme.typography.labelSmall.copy(
                    fontSize = PickerMetrics.rowActionTextSize,
                    fontWeight = FontWeight.Bold,
                ),
            color = if (added) PickerColors.Emerald300 else PickerColors.Violet200,
            maxLines = 1,
        )
    }
}

/** Add / remove, in the site's words. */
private fun labelOf(state: PickerRowState): String =
    when (state) {
        PickerRowState.Add -> ServicesSheetCopy.ADD
        PickerRowState.Remove -> ServicesSheetCopy.REMOVE
    }

/** A hairline under every row but the last, as the site's `border-b` draws. */
private fun Modifier.bottomHairline(last: Boolean): Modifier =
    if (last) {
        this
    } else {
        drawBehind {
            drawRect(
                color = PickerColors.Divider.copy(alpha = 0.6f),
                topLeft = Offset(0f, size.height - 1f),
                size = Size(size.width, 1f),
            )
        }
    }
