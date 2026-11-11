package com.royaraqamia.app.linksnap

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * The analytics drawer's CSV action (#964), ported from the page's
 * `link-analytics-drawer.tsx`.
 *
 * The page hands the file to the platform's share sheet when it can and
 * downloads it otherwise; the app always shares it, so the action says
 * «مشاركة» on both clients. The button is disabled when the period has no
 * clicks, exactly as the page disables it, and the failure face keeps the
 * page's sentence beside the action rather than replacing the drawer.
 */
@Composable
internal fun LinksnapAnalyticsExportControl(
    state: LinksnapAnalyticsExportUiState,
    enabled: Boolean,
    onExport: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val busy = state is LinksnapAnalyticsExportUiState.Busy
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.End,
        verticalArrangement = Arrangement.spacedBy(LinksnapAnalyticsExportMetrics.errorGap),
    ) {
        Row(
            modifier =
                Modifier.testTag(LinksnapAnalyticsExportMetrics.BUTTON)
                    .alpha(if (enabled && !busy) 1f else 0.5f)
                    .clip(RoundedCornerShape(LinksnapAnalyticsExportMetrics.radius))
                    .background(RoyColors.card)
                    .border(
                        1.dp,
                        RoyColors.border,
                        RoundedCornerShape(LinksnapAnalyticsExportMetrics.radius),
                    )
                    .clickable(enabled = enabled && !busy, role = Role.Button, onClick = onExport)
                    .padding(
                        horizontal = LinksnapAnalyticsExportMetrics.paddingX,
                        vertical = LinksnapAnalyticsExportMetrics.paddingY,
                    ),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(LinksnapAnalyticsExportMetrics.gap),
        ) {
            Icon(
                imageVector =
                    if (busy) LucideVectors.LoaderCircle else LucideVectors.Share2,
                contentDescription = null,
                modifier = Modifier.size(LinksnapAnalyticsExportMetrics.icon),
                tint = RoyColors.foreground,
            )
            Text(
                text =
                    if (busy) LinksnapAnalyticsExportCopy.EXPORTING
                    else LinksnapAnalyticsExportCopy.EXPORT_ACTION,
                style =
                    TextStyle(
                        fontSize = LinksnapAnalyticsExportMetrics.labelSize,
                        lineHeight = LinksnapAnalyticsExportMetrics.labelLineHeight,
                        fontWeight = FontWeight.Bold,
                        color = RoyColors.foreground,
                    ),
            )
        }

        if (state is LinksnapAnalyticsExportUiState.Failed) {
            Text(
                text = LinksnapAnalyticsExportCopy.EXPORT_FAILED,
                modifier = Modifier.testTag(LinksnapAnalyticsExportMetrics.ERROR),
                style =
                    TextStyle(
                        fontSize = LinksnapAnalyticsExportMetrics.labelSize,
                        lineHeight = LinksnapAnalyticsExportMetrics.labelLineHeight,
                        color = RoyColors.destructive,
                    ),
            )
        }
    }
}

internal object LinksnapAnalyticsExportMetrics {
    const val BUTTON = "linksnap-analytics-export"
    const val ERROR = "linksnap-analytics-export-error"

    val radius = 8.dp
    val paddingX = 12.dp
    val paddingY = 6.dp
    val gap = 6.dp
    val icon = 16.dp
    val labelSize = 12.sp
    val labelLineHeight = 16.sp
    val errorGap = 6.dp
}
