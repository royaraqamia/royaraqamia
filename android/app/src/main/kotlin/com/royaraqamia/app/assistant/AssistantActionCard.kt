package com.royaraqamia.app.assistant

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.contracts.generated.ChatAgentActionStatus
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.RoyColors

/** The tags a Compose test uses to find the two answers (#1182). */
internal object AssistantActionTags {
    const val CARD = "assistant-action-card"
    const val CONFIRM = "assistant-action-confirm"
    const val REJECT = "assistant-action-reject"
}

/**
 * A proposal under its message, in the native sheet (#1182).
 *
 * The sentence is the assistant's own line that the server wrote into the
 * message, so it is the same sentence the page's card shows. The status and the
 * two answers come from `AssistantPanelCopy`, the same source the site renders —
 * nothing here carries a retyped Arabic word (ADR-0098).
 */
@Composable
fun AssistantActionCard(
    action: AssistantAction,
    sentence: String,
    onAnswer: (String) -> Unit,
    modifier: Modifier = Modifier,
    busy: Boolean = false,
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current
    val open = action.status == ChatAgentActionStatus.PROPOSED
    val reason = action.result?.error?.takeIf { it.isNotBlank() }

    Column(
        modifier =
            modifier
                .fillMaxWidth(0.85f)
                .background(RoyColors.muted.copy(alpha = 0.7f), RoundedCornerShape(16.dp))
                .padding(horizontal = 12.dp, vertical = 8.dp)
                .testTag(AssistantActionTags.CARD),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2),
    ) {
        // The one thing an operator's confirm must never be is indistinguishable
        // from a routine one (ADR-0180, decision 10). The server declares admin
        // tools under the `admin_` prefix (shared/contracts/chat-agent-actions.ts).
        if (action.tool.startsWith("admin_")) {
            Text(
                text = AssistantPanelCopy.ACTION_ADMIN_MARK,
                style = type.xs.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.warning,
            )
        }
        Text(text = sentence, style = type.small.copy(fontWeight = FontWeight.Bold))
        Text(text = action.status.label(), style = type.xs, color = RoyColors.mutedForeground)
        if (reason != null) {
            Text(text = reason, style = type.xs, color = RoyColors.destructive)
        }
        if (open) {
            Row(horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm)) {
                Button(
                    onClick = { onAnswer("confirm") },
                    enabled = !busy,
                    modifier = Modifier.testTag(AssistantActionTags.CONFIRM),
                ) {
                    Text(text = AssistantPanelCopy.ACTION_CONFIRM, style = type.small)
                }
                OutlinedButton(
                    onClick = { onAnswer("reject") },
                    enabled = !busy,
                    modifier = Modifier.testTag(AssistantActionTags.REJECT),
                ) {
                    Text(text = AssistantPanelCopy.ACTION_REJECT, style = type.small)
                }
            }
        }
    }
}

/** The status line the resolved row shows instead of the two answers. */
private fun ChatAgentActionStatus.label(): String =
    when (this) {
        ChatAgentActionStatus.PROPOSED -> AssistantPanelCopy.ACTION_STATUS_PROPOSED
        ChatAgentActionStatus.CONFIRMED -> AssistantPanelCopy.ACTION_STATUS_CONFIRMED
        ChatAgentActionStatus.REJECTED -> AssistantPanelCopy.ACTION_STATUS_REJECTED
        ChatAgentActionStatus.APPLIED -> AssistantPanelCopy.ACTION_STATUS_APPLIED
        ChatAgentActionStatus.FAILED -> AssistantPanelCopy.ACTION_STATUS_FAILED
    }
