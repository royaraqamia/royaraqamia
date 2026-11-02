package com.royaraqamia.app.verify

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
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyShape
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/**
 * The site's `/verify` as a screen (#658).
 *
 * The page: its title, the code field with its two side notes, and whatever the
 * check came to — the certificate card ([CertificateResultCard]), the busy card, or
 * the failure card. The screen owns what the page owns around those cards: the
 * code being typed, the one request, and the sentence a copy leaves behind.
 *
 * Three rules come straight from the page and are the reason this is not a form
 * wrapped around the card:
 *
 * - the code is upper-cased as it is typed, because the site's field does that and
 *   a pasted lower-case code must not be "not found" for a difference the record
 *   does not have;
 * - the format hint appears only once there is enough of a code to judge, which is
 *   the site's `code.length >= 5` and not a second opinion;
 * - an answer of "no such code" and a request that never left are different cards,
 *   because a visitor whose radio is off has not been told anything about the code.
 *
 * The clipboard is the caller's ([onCopy]): a platform service reached from a screen
 * is a screen that cannot be drawn in a test.
 */
@Composable
fun VerifyScreen(
    repository: VerifyRepository,
    onCopy: (String) -> Unit,
    onOpenScan: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val scope = rememberCoroutineScope()

    var code by remember { mutableStateOf("") }
    var state by remember { mutableStateOf<VerifyUiState>(VerifyUiState.Idle) }
    var copied by remember { mutableStateOf(false) }

    val busy = state is VerifyUiState.Busy
    val checkable = code.isNotBlank() && !busy

    fun check() {
        val typed = code.trim()
        if (typed.isEmpty() || busy) return
        state = VerifyUiState.Busy
        scope.launch { state = VerifyUiState.of(repository.verify(VerifyRepository.normalizeCode(typed))) }
    }

    // The site clears the mark after two seconds; so does this, so a second copy of
    // the same code still says something happened.
    LaunchedEffect(copied) {
        if (!copied) return@LaunchedEffect
        delay(COPIED_MARK_MS)
        copied = false
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
            text = VerifyCopy.PAGE_TITLE,
            modifier = Modifier.fillMaxWidth(),
            style = type.h2,
            color = RoyColors.primary,
            textAlign = TextAlign.Center,
        )

        Surface(
            modifier = Modifier.fillMaxWidth(),
            shape = RoyShape.card,
            color = RoyColors.card.copy(alpha = 0.8f),
            border = BorderStroke(1f.dp, RoyColors.border.copy(alpha = 0.6f)),
        ) {
            Column(
                modifier = Modifier.padding(Recipes.Card.padding(spacing)),
                verticalArrangement = Arrangement.spacedBy(spacing.elementGap),
            ) {
                OutlinedTextField(
                    value = code,
                    onValueChange = { code = it.uppercase() },
                    singleLine = true,
                    enabled = !busy,
                    label = { Text(VerifyCopy.CODE_LABEL) },
                    placeholder = { Text(VerifyCopy.PLACEHOLDER) },
                    keyboardOptions =
                        KeyboardOptions(
                            capitalization = KeyboardCapitalization.Characters,
                            imeAction = ImeAction.Search,
                        ),
                    keyboardActions = KeyboardActions(onSearch = { check() }),
                    trailingIcon = {
                        if (VerifyCode.isValidFormat(code)) {
                            Icon(
                                imageVector = LucideVectors.CircleCheck,
                                contentDescription = null,
                                tint = RoyColors.success,
                                modifier = Modifier.size(Recipes.Glyph.sm),
                            )
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                )

                if (VerifyCode.isSuspicious(code)) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2f),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector = LucideVectors.CircleAlert,
                            contentDescription = null,
                            tint = RoyColors.destructive,
                            modifier = Modifier.size(Recipes.Glyph.sm),
                        )
                        Text(
                            text = VerifyCopy.INVALID_FORMAT,
                            style = type.xs,
                            color = RoyColors.destructive,
                        )
                    }
                }

                Button(
                    onClick = { check() },
                    enabled = checkable,
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Icon(
                        imageVector =
                            if (busy) LucideVectors.LoaderCircle else LucideVectors.Search,
                        contentDescription = null,
                        modifier = Modifier.size(Recipes.Glyph.sm),
                    )
                    Text(
                        text = if (busy) VerifyCopy.BUSY_TITLE else VerifyCopy.SUBMIT,
                        modifier = Modifier.padding(start = spacing.elementGapSm / 2f),
                    )
                }

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    SampleHint(onClick = { code = VerifyCopy.SAMPLE_CODE })
                    ScanHint(onClick = onOpenScan)
                }
            }
        }

        when (val shown = state) {
            VerifyUiState.Idle, VerifyUiState.Busy -> Unit

            is VerifyUiState.Found ->
                Box(
                    modifier =
                        Modifier.fillMaxWidth().semantics {
                            contentDescription = VerifyCopy.FOUND_LABEL
                        },
                ) {
                    CertificateResultCard(
                        certificate = shown.certificate,
                        state = CertificateResultState.of(shown.certificate.expiration_date),
                        copied = copied,
                        onCopy = { appCode ->
                            onCopy(appCode)
                            copied = true
                        },
                    )
                }

            is VerifyUiState.NotFound ->
                Failure(
                    title = VerifyCopy.NOT_FOUND_TITLE,
                    subtitle = VerifyCopy.NOT_FOUND_BODY,
                    message = shown.message,
                    badge = VerifyCopy.NOT_FOUND_BADGE,
                    onRetry = {
                        state = VerifyUiState.Idle
                        code = ""
                    },
                )

            is VerifyUiState.RateLimited ->
                Failure(
                    title = VerifyCopy.RATE_LIMITED_TITLE,
                    subtitle = VerifyCopy.RATE_LIMITED_BODY,
                    message = shown.message,
                    badge = VerifyCopy.RATE_LIMITED_BADGE,
                    onRetry = {
                        state = VerifyUiState.Idle
                        code = ""
                    },
                )

            VerifyUiState.Unreachable ->
                Failure(
                    title = VerifyCopy.UNREACHABLE_TITLE,
                    subtitle = VerifyCopy.UNREACHABLE_BODY,
                    message = null,
                    badge = VerifyCopy.UNREACHABLE_BADGE,
                    onRetry = { state = VerifyUiState.Idle },
                )
        }
    }
}

/** The site's `مثال للتَّجربة:` — a tap fills the field with its own sample code. */
@Composable
private fun SampleHint(onClick: () -> Unit) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Row(
        modifier = Modifier.clickable(onClick = onClick),
        horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2f),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = LucideVectors.ScanLine,
            contentDescription = null,
            tint = RoyColors.primary,
            modifier = Modifier.size(Recipes.Glyph.sm - 2f.dp),
        )
        Text(
            text = "${VerifyCopy.SAMPLE_LABEL} ${VerifyCopy.SAMPLE_CODE}",
            style = type.xs,
            color = RoyColors.primary,
        )
    }
}

/** The site's scanner link; the app has no scanner screen, so this opens the document. */
@Composable
private fun ScanHint(onClick: () -> Unit) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Row(
        modifier = Modifier.clickable(onClick = onClick),
        horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2f),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = LucideVectors.ScanBarcode,
            contentDescription = null,
            tint = RoyColors.primary,
            modifier = Modifier.size(Recipes.Glyph.sm - 2f.dp),
        )
        Text(text = VerifyCopy.SCAN_HINT, style = type.xs, color = Recipes.Row.labelColor)
    }
}

/**
 * The site's failure card: the reason, its badge, the server's own sentence when it
 * sent one, and one way back to the form.
 */
@Composable
private fun Failure(
    title: String,
    subtitle: String,
    message: String?,
    badge: String,
    onRetry: () -> Unit,
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoyShape.card,
        color = RoyColors.card.copy(alpha = 0.9f),
        border = BorderStroke(1f.dp, RoyColors.destructive.copy(alpha = 0.3f)),
    ) {
        Column(
            modifier = Modifier.padding(Recipes.Card.padding(spacing)),
            verticalArrangement = Arrangement.spacedBy(spacing.elementGap),
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Icon(
                    imageVector = LucideVectors.CircleAlert,
                    contentDescription = null,
                    tint = RoyColors.destructive,
                    modifier = Modifier.size(Recipes.Glyph.md),
                )
                Column(
                    modifier = Modifier.weight(1f),
                    verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2f),
                ) {
                    Text(
                        text = title,
                        style = type.small.copy(fontWeight = FontWeight.Bold),
                        color = RoyColors.destructive,
                    )
                    Text(text = subtitle, style = type.xs, color = Recipes.Row.labelColor)
                }
                Badge(badge)
            }

            if (message != null) {
                Surface(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoyShape.card,
                    color = RoyColors.destructive.copy(alpha = 0.05f),
                    border = BorderStroke(1f.dp, RoyColors.destructive.copy(alpha = 0.15f)),
                ) {
                    Text(
                        text = message,
                        modifier = Modifier.padding(spacing.elementGapSm),
                        style = type.small,
                        color = MaterialTheme.colorScheme.onSurface,
                    )
                }
            }

            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.End) {
                OutlinedButton(onClick = onRetry, shape = MaterialTheme.shapes.medium) {
                    Icon(
                        imageVector = LucideVectors.RotateCcw,
                        contentDescription = null,
                        modifier = Modifier.size(Recipes.Glyph.sm),
                    )
                    Text(
                        text = VerifyCopy.RETRY,
                        modifier = Modifier.padding(start = spacing.elementGapSm / 2f),
                    )
                }
            }
        }
    }
}

/** The site's pill: `غير مُسجَّلَة`, in the card's alert tone. */
@Composable
private fun Badge(label: String) {
    val size = Recipes.Badge.default(LocalRoyTypeScale.current)

    Surface(
        shape = Recipes.Badge.radius,
        color = RoyColors.destructive.copy(alpha = 0.15f),
        border = BorderStroke(Recipes.Badge.borderWidth, RoyColors.destructive.copy(alpha = 0.3f)),
    ) {
        Box(
            modifier = Modifier.padding(horizontal = size.paddingX, vertical = size.paddingY),
            contentAlignment = Alignment.Center,
        ) {
            Text(text = label, style = size.text, color = RoyColors.destructive)
        }
    }
}

private const val COPIED_MARK_MS = 2_000L
