package com.royaraqamia.app.account

import androidx.compose.animation.core.animateDpAsState
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
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.heading
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.chats.ChatFailure
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyShape
import kotlinx.coroutines.launch

/**
 * The site's `/account/memory` as a screen (#1428, ADR-0182 decision 6).
 *
 * The second client of `frontend/ui/account/memory-view.tsx`, not a second
 * design: the same four faces ([MemoryUiState]), the same card
 * ([Recipes.Card] radius and container), the same one switch, the same
 * grouped facts with their edit and forget controls, and the same words,
 * generated from `shared/copy/account-memory.json` rather than retyped
 * (ADR-0098). `docs/mobile/parity.json` lists the pair, and
 * `npm run check:parity` fails a state or a string that exists on one side only.
 *
 * **Switched off until it is measured.** `docs/mobile/screens.json` carries this
 * screen as `enabled: false` and `docs/mobile/parity-plan.json` keeps the surface
 * `todo`: the document still draws `/account/memory` until `check:visual` finds
 * the same boxes and the same pixels as the page (ADR-0117, ADR-0118). The
 * layout here is therefore a first draft drawn from the shared recipes, not a
 * measured copy, and `shared/visual/account-memory.json` is the contract the
 * measurement will be recorded against.
 *
 * The export is the page's own route opened in the browser: the answer is an
 * attachment, so the file lands in the member's downloads rather than in a
 * WebView this screen does not own.
 */
@Composable
fun MemoryScreen(
    repository: MemoryRepository,
    signedIn: Boolean,
    onSignIn: () -> Unit,
    onExport: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current
    val scale = LocalRoyTypeScale.current
    val scope = rememberCoroutineScope()
    var state by remember { mutableStateOf<MemoryUiState>(MemoryUiState.Loading) }
    var actionError by remember { mutableStateOf<String?>(null) }
    var busy by remember { mutableStateOf<String?>(null) }
    var editing by remember { mutableStateOf<String?>(null) }
    var draft by remember { mutableStateOf("") }

    suspend fun read() {
        state = MemoryUiState.Loading
        state = MemoryUiState.from(repository.read())
    }

    fun fail(sentence: String?) {
        actionError = sentence
    }

    fun forget(fact: MemoryFact) {
        if (busy != null) return
        scope.launch {
            busy = fact.id
            when (val result = repository.forget(fact.id)) {
                is ApiResult.Failure -> fail(ChatFailure.sentenceOf(result.error) ?: AccountMemoryCopy.FORGET_FAILED)
                is ApiResult.Success -> {
                    fail(null)
                    val current = state
                    if (current is MemoryUiState.Ready) {
                        state =
                            current.copy(
                                memory =
                                    current.memory.copy(
                                        facts = current.memory.facts.filterNot { it.id == fact.id }
                                    )
                            )
                    }
                }
            }
            busy = null
        }
    }

    fun save(fact: MemoryFact) {
        if (busy != null || draft.isBlank()) return
        scope.launch {
            busy = fact.id
            when (val result = repository.edit(fact.id, draft.trim())) {
                is ApiResult.Failure -> fail(ChatFailure.sentenceOf(result.error) ?: AccountMemoryCopy.SAVE_FAILED)
                is ApiResult.Success -> {
                    fail(null)
                    editing = null
                    val current = state
                    if (current is MemoryUiState.Ready) {
                        state =
                            current.copy(
                                memory =
                                    current.memory.copy(
                                        facts =
                                            current.memory.facts.map { row ->
                                                if (row.id == fact.id) row.copy(text = draft.trim()) else row
                                            }
                                    )
                            )
                    }
                }
            }
            busy = null
        }
    }

    fun toggle() {
        if (busy != null) return
        val current = state
        if (current !is MemoryUiState.Ready) return
        val next = !current.memory.settings.isOn
        scope.launch {
            busy = "settings"
            when (val result = repository.setEnabled(next)) {
                is ApiResult.Failure ->
                    fail(ChatFailure.sentenceOf(result.error) ?: AccountMemoryCopy.SETTINGS_SAVE_FAILED)
                is ApiResult.Success -> {
                    fail(null)
                    state = current.copy(memory = current.memory.copy(settings = result.value))
                }
            }
            busy = null
        }
    }

    LaunchedEffect(repository, signedIn) {
        actionError = null
        if (signedIn) read() else state = MemoryUiState.SignedOut
    }

    Column(
        modifier =
            modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = spacing.elementGap, vertical = spacing.elementGapSm),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        Text(
            text = AccountMemoryCopy.PAGE_TITLE,
            modifier =
                Modifier.fillMaxWidth()
                    .testTag("memory-title")
                    .semantics { heading() },
            style = scale.h2,
            color = RoyColors.foreground,
            textAlign = TextAlign.Center,
        )

        when (val current = state) {
            MemoryUiState.Loading ->
                Column(
                    modifier = Modifier.fillMaxWidth().testTag("memory-loading"),
                    horizontalAlignment = Alignment.CenterHorizontally,
                ) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp)
                    Text(
                        text = AccountMemoryCopy.LOADING_LABEL,
                        style = scale.xs,
                        color = RoyColors.mutedForeground,
                    )
                }

            MemoryUiState.SignedOut ->
                Column(
                    modifier =
                        Modifier.fillMaxWidth()
                            .clip(RoyShape.card)
                            .background(Recipes.Card.container)
                            .border(Recipes.Card.border, RoyShape.card)
                            .padding(Recipes.Card.padding(spacing))
                            .testTag("memory-signed-out"),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
                ) {
                    Text(
                        text = AccountMemoryCopy.SIGNED_OUT_TITLE,
                        style = scale.small,
                        fontWeight = FontWeight.Bold,
                        color = RoyColors.foreground,
                        textAlign = TextAlign.Center,
                    )
                    Text(
                        text = AccountMemoryCopy.SIGN_IN,
                        modifier =
                            Modifier.clip(RoyShape.card)
                                .border(Recipes.Card.border, RoyShape.card)
                                .clickable { onSignIn() }
                                .padding(horizontal = spacing.elementGap, vertical = spacing.elementGapSm),
                        style = scale.xs,
                        color = RoyColors.foreground,
                    )
                }

            is MemoryUiState.Failed ->
                Text(
                    text = current.message ?: AccountMemoryCopy.LOAD_FAILED,
                    modifier = Modifier.fillMaxWidth().testTag("memory-error"),
                    style = scale.xs,
                    color = RoyColors.destructive,
                )

            is MemoryUiState.Ready -> {
                actionError?.let { sentence ->
                    Text(
                        text = sentence,
                        modifier = Modifier.fillMaxWidth().testTag("memory-error"),
                        style = scale.xs,
                        color = RoyColors.destructive,
                    )
                }

                SettingsCard(
                    settings = current.memory.settings,
                    busy = busy,
                    onToggle = ::toggle,
                )

                ExportCard(onExport = onExport)

                if (current.isEmpty) {
                    Column(
                        modifier =
                            Modifier.fillMaxWidth()
                                .clip(RoyShape.card)
                                .background(Recipes.Card.container)
                                .border(Recipes.Card.border, RoyShape.card)
                                .padding(Recipes.Card.padding(spacing))
                                .testTag("memory-empty"),
                        horizontalAlignment = Alignment.CenterHorizontally,
                        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
                    ) {
                        Text(
                            text = AccountMemoryCopy.EMPTY_TITLE,
                            style = scale.small,
                            fontWeight = FontWeight.Bold,
                            color = RoyColors.foreground,
                            textAlign = TextAlign.Center,
                        )
                        Text(
                            text = AccountMemoryCopy.EMPTY_HINT,
                            style = scale.xs,
                            color = RoyColors.mutedForeground,
                            textAlign = TextAlign.Center,
                        )
                    }
                } else {
                    val ordered =
                        listOf(MemoryScope.ACCOUNT, MemoryScope.PRODUCT, MemoryScope.THREAD)
                    for (part in ordered) {
                        val facts = current.memory.facts.filter { it.scope == part }
                        if (facts.isEmpty()) continue
                        FactGroup(
                            scope = part,
                            facts = facts,
                            editing = editing,
                            draft = draft,
                            busy = busy,
                            onDraft = { draft = it },
                            onEdit = { fact ->
                                editing = fact.id
                                draft = fact.text
                            },
                            onCancel = { editing = null },
                            onSave = ::save,
                            onForget = ::forget,
                        )
                    }
                }
            }
        }
    }
}

/** The page's one switch, under the page's heading and sentence. */
@Composable
private fun SettingsCard(
    settings: MemorySettings,
    busy: String?,
    onToggle: () -> Unit,
) {
    val spacing = LocalRoySpacing.current
    val scale = LocalRoyTypeScale.current
    val enabled = settings.isOn
    Column(
        modifier =
            Modifier.fillMaxWidth()
                .clip(RoyShape.card)
                .background(Recipes.Card.container)
                .border(Recipes.Card.border, RoyShape.card)
                .padding(Recipes.Card.padding(spacing))
                .testTag("memory-settings"),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        Text(
            text = AccountMemoryCopy.SETTINGS_TITLE,
            style = scale.small,
            fontWeight = FontWeight.Bold,
            color = RoyColors.foreground,
        )
        Text(
            text = AccountMemoryCopy.SETTINGS_HINT,
            style = scale.xs,
            color = RoyColors.mutedForeground,
        )
        Row(
            modifier = Modifier.fillMaxWidth().testTag("memory-switch-row"),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = AccountMemoryCopy.SETTINGS_LABEL,
                style = scale.xs,
                fontWeight = FontWeight.Bold,
                color = RoyColors.foreground,
            )
            MemorySwitch(
                enabled = enabled,
                tag = "memory-switch",
                description =
                    if (enabled) AccountMemoryCopy.SETTINGS_OFF_ARIA
                    else AccountMemoryCopy.SETTINGS_ON_ARIA,
                disabled = busy == "settings",
                onClick = onToggle,
            )
        }
    }
}

/** The page's switch: the site's own track and knob, and the same 200ms travel. */
@Composable
private fun MemorySwitch(
    enabled: Boolean,
    tag: String,
    description: String,
    disabled: Boolean,
    onClick: () -> Unit,
) {
    // The web component's travel: the knob sits 4dp in when the switch is on and
    // 22dp in when it is off, inside a 48dp track with a 20dp knob.
    val position by
        animateDpAsState(targetValue = if (enabled) 4.dp else 22.dp, label = "memory-switch")
    Box(
        modifier =
            Modifier.width(48.dp)
                .height(28.dp)
                .clip(RoyShape.pill)
                .background(
                    if (enabled) Brush.horizontalGradient(Recipes.Cta.stops)
                    else SolidColor(RoyColors.muted)
                )
                .border(
                    if (enabled) BorderStroke(1.dp, Color.White.copy(alpha = 0.2f))
                    else BorderStroke(1.dp, RoyColors.border.copy(alpha = 0.7f)),
                    RoyShape.pill,
                )
                .clickable(enabled = !disabled, onClick = onClick)
                .testTag(tag)
                .semantics { contentDescription = description },
        contentAlignment = Alignment.CenterStart,
    ) {
        Box(
            modifier =
                Modifier.offset(x = position)
                    .size(20.dp)
                    .clip(CircleShape)
                    .background(RoyColors.background)
        )
    }
}

/** The export: the page's own route, opened as a file. */
@Composable
private fun ExportCard(onExport: () -> Unit) {
    val spacing = LocalRoySpacing.current
    val scale = LocalRoyTypeScale.current
    Row(
        modifier =
            Modifier.fillMaxWidth()
                .clip(RoyShape.card)
                .background(Recipes.Card.container)
                .border(Recipes.Card.border, RoyShape.card)
                .padding(Recipes.Card.padding(spacing))
                .testTag("memory-export"),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Text(
            text = AccountMemoryCopy.EXPORT_HINT,
            modifier = Modifier.weight(1f),
            style = scale.xs,
            color = RoyColors.mutedForeground,
        )
        Text(
            text = AccountMemoryCopy.EXPORT,
            modifier =
                Modifier.clip(RoyShape.card)
                    .border(Recipes.Card.border, RoyShape.card)
                    .clickable { onExport() }
                    .padding(horizontal = spacing.elementGapSm, vertical = spacing.elementGapSm),
            style = scale.xs,
            fontWeight = FontWeight.Bold,
            color = RoyColors.foreground,
        )
    }
}

/** One scope's facts, with the two controls every fact carries. */
@Composable
private fun FactGroup(
    scope: MemoryScope,
    facts: List<MemoryFact>,
    editing: String?,
    draft: String,
    busy: String?,
    onDraft: (String) -> Unit,
    onEdit: (MemoryFact) -> Unit,
    onCancel: () -> Unit,
    onSave: (MemoryFact) -> Unit,
    onForget: (MemoryFact) -> Unit,
) {
    val spacing = LocalRoySpacing.current
    val scale = LocalRoyTypeScale.current
    val key = scope.name.lowercase()

    Column(verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm)) {
        Text(
            text = sectionLabel(scope),
            style = scale.xs,
            fontWeight = FontWeight.Bold,
            color = RoyColors.mutedForeground,
        )
        Column(
            modifier =
                Modifier.fillMaxWidth()
                    .clip(RoyShape.card)
                    .background(Recipes.Card.container)
                    .border(Recipes.Card.border, RoyShape.card)
                    .testTag("memory-list-$key"),
        ) {
            facts.forEachIndexed { index, fact ->
                if (index > 0) {
                    HorizontalDivider(color = RoyColors.border.copy(alpha = 0.4f))
                }
                FactRow(
                    fact = fact,
                    index = index,
                    key = key,
                    isEditing = editing == fact.id,
                    draft = draft,
                    busy = busy,
                    onDraft = onDraft,
                    onEdit = { onEdit(fact) },
                    onCancel = onCancel,
                    onSave = { onSave(fact) },
                    onForget = { onForget(fact) },
                )
            }
        }
    }
}

@Composable
private fun FactRow(
    fact: MemoryFact,
    index: Int,
    key: String,
    isEditing: Boolean,
    draft: String,
    busy: String?,
    onDraft: (String) -> Unit,
    onEdit: () -> Unit,
    onCancel: () -> Unit,
    onSave: () -> Unit,
    onForget: () -> Unit,
) {
    val spacing = LocalRoySpacing.current
    val scale = LocalRoyTypeScale.current

    Column(
        modifier =
            Modifier.fillMaxWidth()
                .padding(horizontal = spacing.cardPadding, vertical = spacing.elementGapSm)
                .testTag("memory-row-$key-$index"),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        if (isEditing) {
            OutlinedTextField(
                value = draft,
                onValueChange = onDraft,
                modifier = Modifier.fillMaxWidth().testTag("memory-editor-$key-$index"),
                textStyle = scale.body,
                singleLine = false,
                maxLines = 3,
            )
        } else {
            Text(
                text = fact.text,
                modifier = Modifier.fillMaxWidth().testTag("memory-text-$key-$index"),
                style = scale.body,
                color = RoyColors.foreground,
            )
            kindLabel(fact.kind)?.let { badge ->
                Text(
                    text = badge,
                    modifier =
                        Modifier.clip(RoyShape.pill)
                            .border(Recipes.Card.border, RoyShape.pill)
                            .padding(horizontal = spacing.elementGapSm, vertical = 2.dp)
                            .testTag("memory-kind-$key-$index"),
                    style = scale.xs,
                    color = RoyColors.mutedForeground,
                )
            }
        }

        Row(
            horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (isEditing) {
                RowAction(
                    label = AccountMemoryCopy.SAVE,
                    tag = "memory-save-$key-$index",
                    tone = RoyColors.foreground,
                    onClick = onSave,
                )
                RowAction(
                    label = AccountMemoryCopy.CANCEL,
                    tag = "memory-cancel-$key-$index",
                    tone = RoyColors.mutedForeground,
                    onClick = onCancel,
                )
            } else {
                RowAction(
                    label = AccountMemoryCopy.EDIT,
                    tag = "memory-edit-$key-$index",
                    tone = RoyColors.foreground,
                    onClick = onEdit,
                )
                RowAction(
                    label = AccountMemoryCopy.DELETE,
                    tag = "memory-delete-$key-$index",
                    tone = RoyColors.destructive,
                    enabled = busy != fact.id,
                    onClick = onForget,
                )
            }
        }
    }
}

/** One small bordered action, the page's `rounded-lg border` button. */
@Composable
private fun RowAction(
    label: String,
    tag: String,
    tone: Color,
    onClick: () -> Unit,
    enabled: Boolean = true,
) {
    val scale = LocalRoyTypeScale.current
    Text(
        text = label,
        modifier =
            Modifier.clip(RoyShape.card)
                .border(Recipes.Card.border, RoyShape.card)
                .clickable(enabled = enabled, onClick = onClick)
                .padding(horizontal = 12.dp, vertical = 6.dp)
                .testTag(tag),
        style = scale.xs,
        fontWeight = FontWeight.Bold,
        color = tone,
    )
}

/** The group's heading, which is the page's own section label. */
private fun sectionLabel(scope: MemoryScope): String =
    when (scope) {
        MemoryScope.ACCOUNT -> AccountMemoryCopy.FACTS_ACCOUNT
        MemoryScope.PRODUCT -> AccountMemoryCopy.FACTS_PRODUCT
        MemoryScope.THREAD -> AccountMemoryCopy.FACTS_THREAD
    }

/** A kind's badge, or `null` for a plain fact: the page draws the same two faces. */
private fun kindLabel(kind: MemoryKind): String? =
    when (kind) {
        MemoryKind.FACT -> null
        MemoryKind.PREFERENCE -> AccountMemoryCopy.KIND_PREFERENCE
        MemoryKind.HEALTH -> AccountMemoryCopy.KIND_HEALTH
        MemoryKind.LEGAL -> AccountMemoryCopy.KIND_LEGAL
        MemoryKind.FINANCIAL -> AccountMemoryCopy.KIND_FINANCIAL
    }
