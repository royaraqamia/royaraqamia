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
import androidx.compose.foundation.selection.toggleable
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
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
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.chats.ChatFailure
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.preferences.HiddenServicesRepository
import com.royaraqamia.app.shared.NeedsConnection
import com.royaraqamia.app.shared.NeedsConnectionState
import com.royaraqamia.app.shell.ServicesEntry
import com.royaraqamia.app.shell.iconOf
import com.royaraqamia.app.shell.labelOf
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import kotlinx.coroutines.launch

/**
 * The site's `/account/services` as a screen (#978).
 *
 * The second client of `frontend/ui/account/hidden-services-view.tsx`, not a
 * second design: every `خدماتنا` row with the switch that hides or restores it,
 * the same words from `shared/copy/account-services.json`, the same row labels
 * and glyphs from the menu's own generated sources, and the same four faces
 * ([AccountServicesUiState]). The read and the write are the page's own route,
 * `/api/me/hidden-services`, so a restore in the app is visible to the page after
 * its next read and a hide on the page is visible to the app the same way
 * (ADR-0098).
 *
 * The write is the whole set, not a delta: the page's truth is "these are off",
 * so a toggle hands the server the recomputed set and draws the set it kept. A
 * refusal leaves the switches where they were and says so above them.
 */
@Composable
fun AccountServicesScreen(
    repository: HiddenServicesRepository,
    signedIn: Boolean,
    onSignIn: () -> Unit,
    onHiddenChanged: (Set<String>) -> Unit = {},
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current
    val scope = rememberCoroutineScope()
    var state by remember { mutableStateOf<AccountServicesUiState>(AccountServicesUiState.Loading) }
    var actionError by remember { mutableStateOf<String?>(null) }
    var saving by remember { mutableStateOf(false) }

    suspend fun read() {
        state = AccountServicesUiState.Loading
        val next = AccountServicesUiState.from(repository.list())
        state = next
        if (next is AccountServicesUiState.Ready) onHiddenChanged(next.hidden)
    }

    /**
     * One switch, then the set the server kept. A refusal keeps the previous set
     * and its sentence: a write that half-succeeded must not look saved.
     */
    fun toggle(entry: ServicesEntry, shown: Boolean) {
        val current = state as? AccountServicesUiState.Ready ?: return
        if (saving) return
        // Recompute from the catalog, as the page does: a route the menu has
        // retired is dropped instead of being sent back and refused.
        val next =
            ServicesEntry.rows
                .map { it.route }
                .filter { route -> if (route == entry.route) shown else route in current.hidden }
                .toSet()

        scope.launch {
            saving = true
            actionError = null
            when (val result = repository.replace(next)) {
                is ApiResult.Success -> {
                    state = AccountServicesUiState.Ready(result.value)
                    onHiddenChanged(result.value)
                }
                is ApiResult.Failure ->
                    when (val error = result.error) {
                        ApiError.NotSignedIn -> state = AccountServicesUiState.SignedOut
                        is ApiError.Server ->
                            actionError =
                                ChatFailure.sentenceOf(error) ?: AccountServicesCopy.HIDE_FAILED
                        is ApiError.Network,
                        is ApiError.InvalidContract -> actionError = AccountServicesCopy.HIDE_FAILED
                    }
            }
            saving = false
        }
    }

    LaunchedEffect(repository, signedIn) {
        // No session is the page's guest prompt, not a failed read.
        actionError = null
        if (signedIn) read() else state = AccountServicesUiState.SignedOut
    }

    Column(
        modifier =
            modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = spacing.elementGap, vertical = spacing.elementGapSm),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGap),
    ) {
        Title()

        when (val current = state) {
            AccountServicesUiState.Loading -> LoadingList()
            AccountServicesUiState.SignedOut -> SignedOutCard(onSignIn)
            is AccountServicesUiState.Failed ->
                NeedsConnection(
                    message = current.message ?: AccountServicesCopy.OFFLINE,
                    state = NeedsConnectionState.Block,
                    onRetry = { scope.launch { read() } },
                )
            is AccountServicesUiState.Ready -> {
                if (actionError != null) Alert(actionError.orEmpty())
                SwitchList(
                    hidden = current.hidden,
                    saving = saving,
                    onToggle = ::toggle,
                )
                if (ServicesEntry.rows.all { it.route in current.hidden }) AllHiddenCard()
            }
        }
    }
}

/** The page's gradient heading, centred above the list. */
@Composable
private fun Title() {
    Text(
        text = AccountServicesCopy.TITLE,
        modifier =
            Modifier.fillMaxWidth()
                .height(AccountServicesMetrics.titleHeight)
                .testTag(AccountServicesMetrics.TITLE)
                .semantics { heading() },
        style =
            TextStyle(
                fontSize = AccountServicesMetrics.titleSize,
                lineHeight = AccountServicesMetrics.titleLineHeight,
                fontWeight = AccountServicesMetrics.titleWeight,
                letterSpacing = AccountServicesMetrics.titleTracking,
                textAlign = TextAlign.Center,
                brush =
                    Brush.horizontalGradient(
                        listOf(
                            AccountServicesMetrics.titleStart,
                            AccountServicesMetrics.titleMiddle,
                            AccountServicesMetrics.titleEnd,
                        )
                    ),
            ),
    )
}

/** The page's three pulsing rows while the read is out. */
@Composable
private fun LoadingList() {
    Column(
        modifier =
            Modifier.fillMaxWidth()
                .testTag(AccountServicesMetrics.LOADING)
                .semantics { contentDescription = AccountServicesCopy.LOADING_LABEL },
        verticalArrangement = Arrangement.spacedBy(AccountServicesMetrics.rowGap),
    ) {
        repeat(3) {
            Box(
                modifier =
                    Modifier.fillMaxWidth()
                        .height(AccountServicesMetrics.skeletonHeight)
                        .clip(RoundedCornerShape(AccountServicesMetrics.cardRadius))
                        .background(RoyColors.muted.copy(alpha = 0.4f))
                        .border(
                            AccountServicesMetrics.borderWidth,
                            RoyColors.border.copy(alpha = 0.4f),
                            RoundedCornerShape(AccountServicesMetrics.cardRadius),
                        )
            )
        }
    }
}

/** The page's guest prompt: the site's gradient way in, wearing its sentence. */
@Composable
private fun SignedOutCard(onSignIn: () -> Unit) {
    val type = LocalRoyTypeScale.current

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
                .testTag(AccountServicesMetrics.SIGNED_OUT)
                .clickable(onClick = onSignIn)
                .padding(horizontal = Recipes.Cta.paddingX),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = AccountServicesCopy.SIGN_IN,
            style = Recipes.Cta.text(type),
            color = Recipes.Cta.content,
            textAlign = TextAlign.Center,
        )
    }
}

/** The page's one row per service, with its switch. */
@Composable
private fun SwitchList(
    hidden: Set<String>,
    saving: Boolean,
    onToggle: (ServicesEntry, Boolean) -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth().testTag(AccountServicesMetrics.LIST),
        verticalArrangement = Arrangement.spacedBy(AccountServicesMetrics.rowGap),
    ) {
        ServicesEntry.rows.forEachIndexed { index, entry ->
            ServiceRow(
                entry = entry,
                index = index,
                shown = entry.route !in hidden,
                saving = saving,
                onToggle = onToggle,
            )
        }
    }
}

/** One service: the menu's glyph and label, its state, and the switch. */
@Composable
private fun ServiceRow(
    entry: ServicesEntry,
    index: Int,
    shown: Boolean,
    saving: Boolean,
    onToggle: (ServicesEntry, Boolean) -> Unit,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val label = labelOf(entry)

    Surface(
        modifier = Modifier.fillMaxWidth().testTag(AccountServicesMetrics.rowTag(index)),
        shape = Recipes.Card.radius,
        color = Recipes.Card.container,
        border = AccountServicesMetrics.rowBorder,
    ) {
        Row(
            modifier =
                Modifier.fillMaxWidth()
                    .padding(horizontal = spacing.elementGap, vertical = 14.dp),
            horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = iconOf(entry),
                contentDescription = null,
                tint = RoyColors.primary,
                modifier = Modifier.size(16.dp),
            )
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(2.dp),
            ) {
                Text(
                    text = label,
                    modifier = Modifier.testTag(AccountServicesMetrics.nameTag(index)),
                    style = type.small.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.foreground,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                Text(
                    text = if (shown) AccountServicesCopy.SHOWN else AccountServicesCopy.HIDDEN,
                    modifier = Modifier.testTag(AccountServicesMetrics.stateTag(index)),
                    style = type.xs,
                    color = RoyColors.mutedForeground,
                )
            }
            ServiceSwitch(
                name = label,
                shown = shown,
                enabled = !saving,
                tag = AccountServicesMetrics.switchTag(index),
                onToggle = { onToggle(entry, it) },
            )
        }
    }
}

/**
 * The page's switch: on and gradient when the service is shown, muted when it is
 * hidden. The pill is LTR like the site's `dir="ltr"`, so the knob moves the same
 * way on the two clients even inside an RTL screen.
 */
@Composable
private fun ServiceSwitch(
    name: String,
    shown: Boolean,
    enabled: Boolean,
    tag: String,
    onToggle: (Boolean) -> Unit,
) {
    val shape = RoundedCornerShape(percent = 50)

    CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Ltr) {
        Box(
            modifier =
                Modifier.size(
                        width = AccountServicesMetrics.switchWidth,
                        height = AccountServicesMetrics.switchHeight,
                    )
                    .testTag(tag)
                    .clip(shape)
                    .background(
                        brush =
                            if (shown) {
                                Brush.horizontalGradient(Recipes.Cta.stops)
                            } else {
                                SolidColor(RoyColors.muted)
                            },
                        shape = shape,
                    )
                    .border(
                        AccountServicesMetrics.borderWidth,
                        if (shown) {
                            Color.White.copy(alpha = 0.2f)
                        } else {
                            RoyColors.border.copy(alpha = 0.7f)
                        },
                        shape,
                    )
                    .toggleable(
                        value = shown,
                        enabled = enabled,
                        role = Role.Switch,
                        onValueChange = onToggle,
                    )
                    .semantics {
                        contentDescription =
                            (if (shown) {
                                    AccountServicesCopy.HIDE_ARIA
                                } else {
                                    AccountServicesCopy.SHOW_ARIA
                                })
                                .replace("{name}", name)
                    }
                    .padding(horizontal = AccountServicesMetrics.switchPadding),
            contentAlignment =
                if (shown) Alignment.CenterStart else Alignment.CenterEnd,
        ) {
            Box(
                modifier =
                    Modifier.size(AccountServicesMetrics.switchKnob)
                        .clip(CircleShape)
                        .background(RoyColors.background)
            )
        }
    }
}

/** The page's sentence for an account that has hidden every service. */
@Composable
private fun AllHiddenCard() {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    Surface(
        modifier = Modifier.fillMaxWidth().testTag(AccountServicesMetrics.ALL_HIDDEN),
        shape = Recipes.Card.radius,
        color = RoyColors.primary.copy(alpha = 0.05f),
        border =
            BorderStroke(
                AccountServicesMetrics.borderWidth,
                RoyColors.primary.copy(alpha = 0.25f),
            ),
    ) {
        Text(
            text = AccountServicesCopy.ALL_HIDDEN,
            modifier =
                Modifier.padding(horizontal = spacing.elementGap, vertical = spacing.elementGapSm),
            style = type.small,
            color = RoyColors.foreground,
        )
    }
}

/** A refused write: the server's own reason, above the list it did not change. */
@Composable
private fun Alert(message: String) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    Surface(
        modifier = Modifier.fillMaxWidth().testTag(AccountServicesMetrics.ERROR),
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

/** The tags and boxes the visual gate will name when this surface is recorded (#978). */
internal object AccountServicesMetrics {
    const val TITLE = "services-title"
    const val LIST = "services-list"
    const val LOADING = "services-loading"
    const val SIGNED_OUT = "services-signed-out"
    const val ERROR = "services-error"
    const val ALL_HIDDEN = "services-all-hidden"

    fun rowTag(index: Int): String = "services-row-$index"

    fun nameTag(index: Int): String = "services-name-$index"

    fun stateTag(index: Int): String = "services-state-$index"

    fun switchTag(index: Int): String = "services-switch-$index"

    val titleSize = 30.sp
    val titleLineHeight = 46.5.sp
    val titleHeight = 46.5.dp
    val titleWeight = FontWeight.ExtraBold
    val titleTracking = (-0.025).em
    val titleStart = Color(0xFFA684FF)
    val titleMiddle = Color(0xFFED6AFF)
    val titleEnd = Color(0xFF7C86FF)

    val cardRadius = 16.dp
    val rowGap = 10.dp
    val skeletonHeight = 64.dp
    val borderWidth = 1.dp
    val rowBorder =
        BorderStroke(
            borderWidth,
            RoyColors.border.copy(alpha = 0.5f),
        )

    val switchWidth = 48.dp
    val switchHeight = 28.dp
    val switchKnob = 20.dp
    val switchPadding = 4.dp
}
