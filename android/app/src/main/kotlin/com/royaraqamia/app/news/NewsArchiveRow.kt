package com.royaraqamia.app.news

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.RoyColors

/**
 * The page's date strip (#926), the one filter the page visibly draws.
 *
 * Every retained day is a chip, and the first chip is the latest digest. The
 * order is the server's (`dates`, newest first), so the app never sorts a list
 * the page already ordered. While a saved digest is on screen the strip stays
 * visible but disabled: a day is a read, and the screen has already named the
 * connection it does not have.
 */
@Composable
internal fun NewsArchiveRow(
    dates: List<String>,
    selected: String?,
    enabled: Boolean,
    onSelect: (String?) -> Unit,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier =
            modifier
                .fillMaxWidth()
                .testTag(NewsDigestMetrics.ARCHIVE)
                .horizontalScroll(rememberScrollState())
                .semantics { contentDescription = NewsArchiveCopy.ARCHIVE_LABEL },
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        ArchiveChip(
            label = NewsArchiveCopy.LATEST,
            selected = selected == null,
            enabled = enabled,
            onClick = { onSelect(null) },
        )
        for (day in dates) {
            ArchiveChip(
                label = NewsFormat.archiveDay(day),
                selected = selected == day,
                enabled = enabled,
                onClick = { onSelect(day) },
            )
        }
    }
}

@Composable
private fun ArchiveChip(
    label: String,
    selected: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val type = LocalRoyTypeScale.current
    val shape = RoundedCornerShape(12.dp)

    Box(
        modifier =
            Modifier.clip(shape)
                .background(
                    if (selected) RoyColors.primary.copy(alpha = 0.15f) else RoyColors.card.copy(alpha = 0.7f),
                )
                .border(
                    1.dp,
                    if (selected) RoyColors.primary.copy(alpha = 0.4f) else RoyColors.border.copy(alpha = 0.6f),
                    shape,
                )
                .clickable(enabled = enabled, role = Role.Button, onClick = onClick)
                .padding(horizontal = 12.dp, vertical = 6.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            style = type.xs.copy(fontWeight = FontWeight.Bold),
            color = if (selected) RoyColors.primary else RoyColors.mutedForeground,
            maxLines = 1,
        )
    }
}
