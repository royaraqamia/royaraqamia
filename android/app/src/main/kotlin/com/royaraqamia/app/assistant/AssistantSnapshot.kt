package com.royaraqamia.app.assistant

import com.royaraqamia.app.contracts.generated.ChatAssistantStateResponseAllowance
import com.royaraqamia.app.contracts.generated.ChatMessagePageResponseMessagesItem
import com.royaraqamia.app.contracts.generated.ChatThreadResponseThreadAttachmentQuota

/**
 * What the sheet last painted, held by the shell for the next open (ADR-0150).
 *
 * The sheet's state used to live inside the composition, and the shell only
 * composed it while it was open — so closing نور threw the conversation, the
 * quota and the draft away, and the next tap asked the server for the thread it
 * had just shown. The shell keeps this small snapshot instead; the sheet seeds
 * its `remember` from it, paints immediately and revalidates behind the paint.
 */
data class AssistantSnapshot(
    val threadId: String?,
    val quota: ChatThreadResponseThreadAttachmentQuota?,
    val messages: List<ChatMessagePageResponseMessagesItem>,
    val available: Boolean,
    val allowance: ChatAssistantStateResponseAllowance?,
)

/**
 * The face a snapshot can wear before the live read answers. The order is the
 * panel's own: no key, then no turn, then the conversation (ADR-0143).
 */
fun AssistantSnapshot.face(): AssistantUiState =
    when {
        !available -> AssistantUiState.Unavailable
        allowance?.member?.cap == 0.0 -> AssistantUiState.Locked
        else -> AssistantUiState.Ready
    }
