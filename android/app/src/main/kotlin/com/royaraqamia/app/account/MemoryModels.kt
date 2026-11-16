package com.royaraqamia.app.account

/**
 * The memory screen's rows and switches (#1428, ADR-0182 decision 6).
 *
 * Kept apart from `MemoryUiState.kt` on purpose: the state file is read by
 * `npm run check:parity`, which compares the sealed interface's cases with the
 * row in `docs/mobile/parity.json`. A model class declared beside them would be
 * read as a fifth state and fail the pair for naming a state the page does not
 * draw.
 */

/** Which part of the member's life a fact belongs to, as the page groups them. */
enum class MemoryScope { ACCOUNT, PRODUCT, THREAD }

/** Why the assistant remembers something. The three named kinds get a badge. */
enum class MemoryKind { FACT, PREFERENCE, HEALTH, LEGAL, FINANCIAL }

/** One saved fact, as the screen draws it. */
data class MemoryFact(
    val id: String,
    val scope: MemoryScope,
    val kind: MemoryKind,
    val text: String,
    /** Set exactly when [scope] is [MemoryScope.PRODUCT]. */
    val product: String?,
    /** Set exactly when [scope] is [MemoryScope.THREAD]. */
    val threadId: String?,
    val updatedAt: String,
)

/**
 * The member's three switches. `false` means the assistant neither saves there
 * nor recalls from there; what is already saved stays on the screen.
 */
data class MemorySettings(
    val account: Boolean,
    val product: Boolean,
    val thread: Boolean,
) {
    fun isOn(scope: MemoryScope): Boolean =
        when (scope) {
            MemoryScope.ACCOUNT -> account
            MemoryScope.PRODUCT -> product
            MemoryScope.THREAD -> thread
        }

    companion object {
        val Default = MemorySettings(account = true, product = true, thread = true)
    }
}

/** The whole read: the facts, newest first, and the switches. */
data class AgentMemory(
    val facts: List<MemoryFact>,
    val settings: MemorySettings,
)
