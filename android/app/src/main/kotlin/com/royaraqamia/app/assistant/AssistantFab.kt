package com.royaraqamia.app.assistant

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.chats.AssistantMark
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.RoyColors

/** The handle a UI test finds the corner's door by, without its label. */
const val ASSISTANT_FAB_TAG = "assistant-fab"

/**
 * The app's floating door to نور (ADR-0143).
 *
 * It is the same control the site draws in the corner: the assistant's own mark
 * and one sentence, on the site's card surface. The frame mounts it once, next
 * to the tab bar rather than over it, and hides it on the two routes the site
 * hides it on ([AssistantLauncherState]).
 *
 * The words are [AssistantLauncherCopy], from the same file the site's launcher
 * reads, so neither client can rename the door on its own.
 */
@Composable
fun AssistantFab(
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
    state: AssistantLauncherState = AssistantLauncherState.Visible,
) {
    if (state == AssistantLauncherState.Hidden) return

    val type = LocalRoyTypeScale.current

    Row(
        modifier =
            modifier
                .testTag(ASSISTANT_FAB_TAG)
                .background(RoyColors.card.copy(alpha = 0.94f), RoundedCornerShape(50))
                .border(1.dp, RoyColors.border.copy(alpha = 0.7f), RoundedCornerShape(50))
                .clickable(onClick = onClick)
                .semantics { contentDescription = AssistantLauncherCopy.NAV_LABEL }
                .padding(start = 6.dp, end = 16.dp, top = 6.dp, bottom = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        AssistantMark(size = 40.dp)
        Text(
            text = AssistantLauncherCopy.LABEL,
            style = type.small.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.foreground,
            maxLines = 1,
        )
    }
}
