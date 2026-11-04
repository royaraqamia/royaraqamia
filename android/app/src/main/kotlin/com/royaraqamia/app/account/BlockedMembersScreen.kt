package com.royaraqamia.app.account

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.royaraqamia.app.chats.ChatFailure
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import kotlinx.coroutines.launch

/**
 * The site's `/account/blocked` as a screen (#977).
 *
 * The second client of `frontend/ui/account/blocked-members-view.tsx`, not a
 * second design: the same four faces ([BlockedMembersUiState]), the same card
 * ([Recipes.Card] radius and container, with the page's own `/70` border), the
 * same row (avatar, name, handle, unblock) and the same words, generated from
 * `shared/copy/account-blocked.json` rather than retyped (ADR-0098).
 * `docs/mobile/parity.json` lists the pair and `npm run check:parity` fails a
 * state or a string that exists on one side only.
 *
 * Blocking lives in the thread's menu; this screen is where it can be lifted
 * without finding that thread again. The read and the unblock are the page's own
 * routes, and an unblock that the server accepts removes the row exactly as the
 * page does — no re-read, because the answer already said it is gone.
 */
@Composable
fun BlockedMembersScreen(
    repository: BlockedMembersRepository,
    signedIn: Boolean,
    onSignIn: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current
    val scope = rememberCoroutineScope()
    var state by remember { mutableStateOf<BlockedMembersUiState>(BlockedMembersUiState.Loading) }
    var actionError by remember { mutableStateOf<String?>(null) }
    var lifting by remember { mutableStateOf<String?>(null) }

    suspend fun read() {
        state = BlockedMembersUiState.Loading
        state = BlockedMembersUiState.from(repository.list())
    }

    /**
     * One unblock, then the row leaves the list the server just agreed is
     * shorter. A refusal keeps the server's own words and leaves the row in
     * place: a block that half-succeeded must not look lifted.
     */
    fun unblock(member: BlockedMember) {
        if (lifting != null) return
        scope.launch {
            lifting = member.id
            when (val result = repository.unblock(member.id)) {
                is ApiResult.Failure ->
                    actionError =
                        ChatFailure.sentenceOf(result.error) ?: BlockedMembersCopy.UNBLOCK_FAILED
                is ApiResult.Success -> {
                    actionError = null
                    val current = state
                    if (current is BlockedMembersUiState.Ready) {
                        state =
                            current.copy(
                                members = current.members.filterNot { it.id == member.id }
                            )
                    }
                }
            }
            lifting = null
        }
    }

    LaunchedEffect(repository, signedIn) {
        // No session is the page's guest prompt, not a failed read.
        actionError = null
        if (signedIn) read() else state = BlockedMembersUiState.SignedOut
    }

    Column(
        modifier =
            modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = spacing.elementGap, vertical = spacing.elementGapSm),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGap),
    ) {
        Text(
            text = BlockedMembersCopy.PAGE_TITLE,
            modifier =
                Modifier.fillMaxWidth()
                    .height(BlockedMembersMetrics.titleHeight)
                    .testTag(BlockedMembersMetrics.TITLE)
                    .semantics { heading() },
            style =
                TextStyle(
                    fontSize = BlockedMembersMetrics.titleSize,
                    lineHeight = BlockedMembersMetrics.titleLineHeight,
                    fontWeight = BlockedMembersMetrics.titleWeight,
                    letterSpacing = BlockedMembersMetrics.titleTracking,
                    textAlign = TextAlign.Center,
                    brush =
                        Brush.horizontalGradient(
                            listOf(
                                BlockedMembersMetrics.titleStart,
                                BlockedMembersMetrics.titleMiddle,
                                BlockedMembersMetrics.titleEnd,
                            )
                        ),
                ),
        )

        when (val current = state) {
            BlockedMembersUiState.Loading -> LoadingCard()
            BlockedMembersUiState.SignedOut -> SignedOutCard(onSignIn)
            is BlockedMembersUiState.Failed -> FailedCard(current.message)
            is BlockedMembersUiState.Ready -> {
                if (actionError != null) Alert(actionError.orEmpty())
                if (current.members.isEmpty()) {
                    EmptyCard()
                } else {
                    MembersList(current.members, lifting, ::unblock)
                }
            }
        }
    }
}

/** The page's spinner: a card with a turning ring and the loading sentence. */
@Composable
private fun LoadingCard() {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    Surface(
        modifier = Modifier.fillMaxWidth().testTag(BlockedMembersMetrics.LOADING),
        shape = Recipes.Card.radius,
        color = Recipes.Card.container,
        border = BlockedMembersMetrics.cardBorder,
    ) {
        Column(
            modifier =
                Modifier.fillMaxWidth()
                    .padding(horizontal = spacing.elementGap, vertical = spacing.cardPadding),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        ) {
            CircularProgressIndicator(
                modifier = Modifier.size(20.dp),
                color = RoyColors.primary,
                strokeWidth = 2.dp,
            )
            Text(
                text = BlockedMembersCopy.LOADING_LABEL,
                style = type.xs.copy(fontWeight = FontWeight.Medium),
                color = RoyColors.mutedForeground,
            )
        }
    }
}

/** The page's guest prompt: the sentence, then the site's gradient way in. */
@Composable
private fun SignedOutCard(onSignIn: () -> Unit) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    Surface(
        modifier = Modifier.fillMaxWidth().testTag(BlockedMembersMetrics.SIGNED_OUT),
        shape = Recipes.Card.radius,
        color = Recipes.Card.container,
        border = BlockedMembersMetrics.cardBorder,
    ) {
        Column(
            modifier =
                Modifier.fillMaxWidth()
                    .padding(
                        horizontal = spacing.elementGap,
                        vertical = spacing.cardPadding * 2,
                    ),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(spacing.elementGap),
        ) {
            Text(
                text = BlockedMembersCopy.SIGNED_OUT_TITLE,
                style = type.small.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.foreground,
                textAlign = TextAlign.Center,
            )
            Box(
                modifier =
                    Modifier.height(Recipes.Cta.height)
                        .widthIn(min = Recipes.Cta.minWidth)
                        .shadow(
                            elevation = Recipes.Cta.bloomY,
                            shape = Recipes.Cta.radius,
                            ambientColor = Recipes.Cta.bloom,
                            spotColor = Recipes.Cta.bloom,
                        )
                        .clip(Recipes.Cta.radius)
                        .background(Brush.horizontalGradient(Recipes.Cta.stops))
                        .border(Recipes.Cta.border, Recipes.Cta.radius)
                        .clickable(onClick = onSignIn)
                        .padding(horizontal = Recipes.Cta.paddingX),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = BlockedMembersCopy.SIGN_IN,
                    style = Recipes.Cta.text(type),
                    color = Recipes.Cta.content,
                )
            }
        }
    }
}

/** The page's failure: the server's sentence when it gave one, and no list. */
@Composable
private fun FailedCard(message: String?) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    Surface(
        modifier = Modifier.fillMaxWidth().testTag(BlockedMembersMetrics.ERROR),
        shape = Recipes.Card.radius,
        color = RoyColors.destructive.copy(alpha = 0.1f),
    ) {
        Text(
            text = message ?: BlockedMembersCopy.LOAD_FAILED,
            modifier =
                Modifier.padding(horizontal = spacing.elementGap, vertical = spacing.elementGapSm),
            style = type.xs.copy(fontWeight = FontWeight.Medium),
            color = RoyColors.destructive,
        )
    }
}

/** The page's sentence for an account that has blocked nobody. */
@Composable
private fun EmptyCard() {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    Surface(
        modifier = Modifier.fillMaxWidth().testTag(BlockedMembersMetrics.EMPTY),
        shape = Recipes.Card.radius,
        color = Recipes.Card.container,
        border = BlockedMembersMetrics.cardBorder,
    ) {
        Text(
            text = BlockedMembersCopy.EMPTY,
            modifier =
                Modifier.fillMaxWidth()
                    .padding(
                        horizontal = spacing.elementGap,
                        vertical = spacing.elementGapSm + spacing.elementGapSm / 2f,
                    ),
            style = type.xs,
            color = RoyColors.mutedForeground.copy(alpha = 0.8f),
            textAlign = TextAlign.Center,
        )
    }
}

/** The list, one card with the page's dividers between its rows. */
@Composable
private fun MembersList(
    members: List<BlockedMember>,
    lifting: String?,
    onUnblock: (BlockedMember) -> Unit,
) {
    Surface(
        modifier = Modifier.fillMaxWidth().testTag(BlockedMembersMetrics.LIST),
        shape = Recipes.Card.radius,
        color = Recipes.Card.container,
        border = BlockedMembersMetrics.cardBorder,
    ) {
        Column {
            members.forEachIndexed { index, member ->
                if (index > 0) HorizontalDivider(color = RoyColors.border.copy(alpha = 0.4f))
                MemberRow(member, index, lifting == member.id, onUnblock)
            }
        }
    }
}

/** One member: the page's avatar, name, `@handle` and unblock pill. */
@Composable
private fun MemberRow(
    member: BlockedMember,
    index: Int,
    busy: Boolean,
    onUnblock: (BlockedMember) -> Unit,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val name = member.name?.takeIf { it.isNotBlank() } ?: member.username

    Row(
        modifier =
            Modifier.fillMaxWidth()
                .testTag(BlockedMembersMetrics.rowTag(index))
                .padding(horizontal = spacing.elementGap, vertical = spacing.elementGapSm),
        horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        BlockedAvatar(name = name, url = member.avatarUrl)

        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2f),
        ) {
            Text(
                text = name,
                modifier = Modifier.testTag(BlockedMembersMetrics.nameTag(index)),
                style = type.small.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.foreground,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            Text(
                text = "@${member.username}",
                modifier = Modifier.testTag(BlockedMembersMetrics.handleTag(index)),
                style = type.xs,
                color = RoyColors.mutedForeground.copy(alpha = 0.7f),
                textAlign = TextAlign.Right,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }

        UnblockButton(
            name = name,
            index = index,
            enabled = !busy,
            onClick = { onUnblock(member) },
        )
    }
}

/** The page's unblock pill: a bordered control that says what it lifts. */
@Composable
private fun UnblockButton(name: String, index: Int, enabled: Boolean, onClick: () -> Unit) {
    val type = LocalRoyTypeScale.current

    Surface(
        onClick = onClick,
        modifier =
            Modifier.testTag(BlockedMembersMetrics.unblockTag(index)).semantics {
                contentDescription = BlockedMembersCopy.UNBLOCK_ARIA.replace("{name}", name)
            },
        enabled = enabled,
        shape = MaterialTheme.shapes.large,
        color = Color.Transparent,
        border = BorderStroke(1f.dp, RoyColors.border.copy(alpha = 0.7f)),
    ) {
        Text(
            text = BlockedMembersCopy.UNBLOCK,
            modifier = Modifier.padding(horizontal = 12.dp, vertical = 6.dp),
            style = type.xs.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.foreground,
        )
    }
}

/** A refused unblock: the server's own reason, above the list it did not change. */
@Composable
private fun Alert(message: String) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = Recipes.Card.radius,
        color = RoyColors.destructive.copy(alpha = 0.1f),
    ) {
        Text(
            text = message,
            modifier =
                Modifier.padding(horizontal = spacing.elementGap, vertical = spacing.elementGapSm),
            style = type.xs.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.destructive,
        )
    }
}

/** A member's face: the picture the directory gave, or the first letter of the name. */
@Composable
private fun BlockedAvatar(name: String, url: String?) {
    val size = BlockedMembersMetrics.avatarSize

    if (!url.isNullOrBlank()) {
        AsyncImage(
            model = url,
            contentDescription = name,
            modifier = Modifier.size(size).clip(CircleShape),
        )
        return
    }

    Box(
        modifier =
            Modifier.size(size)
                .clip(CircleShape)
                .background(RoyColors.primary.copy(alpha = 0.15f)),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = name.trim().take(1),
            style = LocalRoyTypeScale.current.xs.copy(fontWeight = FontWeight.Bold),
            color = RoyColors.primary,
        )
    }
}

/** The tags and boxes the visual gate will name when this surface is recorded (#977). */
internal object BlockedMembersMetrics {
    const val TITLE = "blocked-title"
    const val LIST = "blocked-list"
    const val LOADING = "blocked-loading"
    const val SIGNED_OUT = "blocked-signed-out"
    const val ERROR = "blocked-error"
    const val EMPTY = "blocked-empty"

    fun rowTag(index: Int): String = "blocked-row-$index"

    fun nameTag(index: Int): String = "blocked-name-$index"

    fun handleTag(index: Int): String = "blocked-handle-$index"

    fun unblockTag(index: Int): String = "blocked-unblock-$index"

    val titleSize = 30.sp
    val titleLineHeight = 46.5.sp
    val titleHeight = 46.5.dp
    val titleWeight = FontWeight.ExtraBold
    val titleTracking = (-0.025).em
    val titleStart = Color(0xFFA684FF)
    val titleMiddle = Color(0xFFED6AFF)
    val titleEnd = Color(0xFF7C86FF)

    val cardBorder = BorderStroke(1f.dp, RoyColors.border.copy(alpha = 0.7f))
    val avatarSize = 36.dp
}
