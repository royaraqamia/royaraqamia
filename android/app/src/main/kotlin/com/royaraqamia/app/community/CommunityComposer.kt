package com.royaraqamia.app.community

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.unit.dp
import androidx.compose.ui.window.Dialog
import com.royaraqamia.app.net.Connectivity
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors
import java.util.Locale
import java.util.UUID
import kotlinx.coroutines.launch

/**
 * The community composer (#924), the app's half of
 * `app/community/_components/post-composer-dialog.tsx` in create mode.
 *
 * The site's composer is a dialog; so is this, and that is why the surface has
 * no row of its own in `docs/mobile/screens.json`: the composer is a state of
 * `community`, opened from the feed's compose control.
 *
 * A publish is one `POST /api/community/posts` with `status: 'published'`, the
 * route and body the page sends, behind [CommunityComposerStore]. The slug is
 * minted once and kept for the composer's whole life, so a retry after an answer
 * that never arrived reads the row back instead of creating a second post. A
 * refusal keeps the words in the field and names the failure; nothing clears.
 *
 * The control's four faces — publish, publishing, published and a refusal — are
 * the site's own, from the one copy source both clients read.
 */
@Composable
fun CommunityComposer(
    store: CommunityComposerStore,
    modifier: Modifier = Modifier,
    /** Injected by the suite; the screen reads the platform's radio. */
    online: Boolean? = null,
    onDismiss: () -> Unit = {},
    onPublished: (String) -> Unit = {},
) {
    val context = LocalContext.current
    val connected = online ?: Connectivity.isOnline(context)
    val scope = rememberCoroutineScope()
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current

    // Minted once, so every retry names the same row. The page builds the same
    // `post-xxxxxxxx` shape (`buildSlug`), and the database keeps it unique.
    val slug =
        remember { "post-" + UUID.randomUUID().toString().replace("-", "").take(8) }
    var body by remember { mutableStateOf("") }
    var state by remember {
        mutableStateOf<CommunityComposerUiState>(CommunityComposerUiState.AtRest)
    }

    fun publish() {
        val text = body.trim()
        if (text.isEmpty()) {
            state = CommunityComposerUiState.Failed(CommunityEditorCopy.EMPTY_BODY)
            return
        }
        if (text.length > CommunityLimits.BODY_MAX) {
            state =
                CommunityComposerUiState.Failed(
                    CommunityEditorCopy.TOO_LONG.replace(
                        "{max}",
                        CommunityLimits.BODY_MAX.toString(),
                    )
                )
            return
        }
        if (!connected) {
            state = CommunityComposerUiState.Failed(CommunityComposerCopy.NEEDS_CONNECTION)
            return
        }
        state = CommunityComposerUiState.Publishing
        scope.launch {
            state =
                when (val result = store.publish(slug, text)) {
                    is CommunityComposerResult.Published -> {
                        onPublished(result.slug)
                        CommunityComposerUiState.Published
                    }
                    is CommunityComposerResult.Failed ->
                        CommunityComposerUiState.Failed(CommunityComposerCopy.PUBLISH_FAILED)
                }
        }
    }

    Dialog(onDismissRequest = onDismiss) {
        Surface(
            shape = Recipes.Card.radius,
            color = RoyColors.background,
            border = Recipes.Card.border,
            modifier = modifier.fillMaxWidth(0.94f),
        ) {
            Column(
                modifier = Modifier.padding(Recipes.Card.padding(spacing)),
                verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
            ) {
                Text(
                    text = CommunityComposerCopy.TITLE,
                    style = type.body.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.foreground,
                    modifier = Modifier.testTag("community-composer-title"),
                )

                OutlinedTextField(
                    value = body,
                    onValueChange = { value ->
                        body = value
                        if (
                            state !is CommunityComposerUiState.Publishing &&
                                state !is CommunityComposerUiState.Published
                        ) {
                            state = CommunityComposerUiState.AtRest
                        }
                    },
                    label = { Text(CommunityEditorCopy.BODY_LABEL) },
                    placeholder = { Text(CommunityEditorCopy.BODY_PLACEHOLDER) },
                    enabled =
                        state !is CommunityComposerUiState.Publishing &&
                            state !is CommunityComposerUiState.Published,
                    minLines = 6,
                    keyboardOptions =
                        KeyboardOptions(
                            keyboardType = KeyboardType.Text,
                            autoCorrectEnabled = true,
                        ),
                    modifier =
                        Modifier.fillMaxWidth()
                            .testTag("community-composer-body")
                            .semantics { contentDescription = CommunityEditorCopy.BODY_ARIA },
                )

                // `dir="ltr"`: two numbers around a slash, and RTL puts the
                // logical first run rightmost. The digits are ASCII (#925).
                Text(
                    text =
                        CommunityEditorCopy.COUNTER
                            .replace("{count}", body.length.toString())
                            .replace(
                                "{max}",
                                String.format(Locale.US, "%,d", CommunityLimits.BODY_MAX),
                            ),
                    style = type.xs.copy(textDirection = TextDirection.Ltr),
                    color =
                        if (body.length > CommunityLimits.BODY_MAX) {
                            RoyColors.destructive
                        } else {
                            RoyColors.mutedForeground
                        },
                    textAlign = TextAlign.End,
                    modifier = Modifier.fillMaxWidth().testTag("community-composer-counter"),
                )

                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    Icon(
                        imageVector =
                            when (state) {
                                is CommunityComposerUiState.AtRest -> LucideVectors.Send
                                is CommunityComposerUiState.Publishing -> LucideVectors.LoaderCircle
                                is CommunityComposerUiState.Published -> LucideVectors.Check
                                is CommunityComposerUiState.Failed -> LucideVectors.X
                            },
                        contentDescription = null,
                        tint =
                            when (state) {
                                is CommunityComposerUiState.Published -> RoyColors.success
                                is CommunityComposerUiState.Failed -> RoyColors.destructive
                                else -> RoyColors.mutedForeground
                            },
                        modifier = Modifier.size(Recipes.Glyph.sm),
                    )
                    Text(
                        text = statusLabel(state),
                        style = type.xs,
                        color =
                            if (state is CommunityComposerUiState.Failed) {
                                RoyColors.destructive
                            } else {
                                RoyColors.mutedForeground
                            },
                        modifier = Modifier.testTag("community-composer-status"),
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                ) {
                    TextButton(onClick = onDismiss) {
                        Text(CommunityEditorCopy.CANCEL, style = type.xs)
                    }
                    Spacer(Modifier.weight(1f))
                    TextButton(
                        onClick = ::publish,
                        enabled =
                            state !is CommunityComposerUiState.Publishing &&
                                state !is CommunityComposerUiState.Published,
                        modifier = Modifier.testTag("community-composer-publish"),
                    ) {
                        Icon(
                            imageVector =
                                when (state) {
                                    is CommunityComposerUiState.Publishing ->
                                        LucideVectors.LoaderCircle
                                    is CommunityComposerUiState.Published -> LucideVectors.Check
                                    else -> LucideVectors.Send
                                },
                            contentDescription = null,
                            modifier = Modifier.size(Recipes.Glyph.sm),
                        )
                        Spacer(Modifier.width(4.dp))
                        Text(text = publishLabel(state), style = type.xs)
                    }
                }
            }
        }
    }
}

/** The site's four publish sentences, from the one copy source. */
private fun statusLabel(state: CommunityComposerUiState): String =
    when (state) {
        is CommunityComposerUiState.AtRest -> CommunityComposerCopy.PUBLISH
        is CommunityComposerUiState.Publishing -> CommunityComposerCopy.PUBLISHING
        is CommunityComposerUiState.Published -> CommunityComposerCopy.PUBLISHED
        is CommunityComposerUiState.Failed -> state.message
    }

/** The control's own words as it moves through the four faces. */
private fun publishLabel(state: CommunityComposerUiState): String =
    when (state) {
        is CommunityComposerUiState.Publishing -> CommunityComposerCopy.PUBLISHING
        is CommunityComposerUiState.Published -> CommunityComposerCopy.PUBLISHED
        else -> CommunityComposerCopy.PUBLISH
    }
