package com.royaraqamia.app.verify

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.sp
import androidx.compose.foundation.layout.Arrangement
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.VerifyResult
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
    VerifyScreen(verify = repository::verify, onCopy = onCopy, onOpenScan = onOpenScan, modifier = modifier)
}

/**
 * The screen over the one call it makes, so a test can draw it without a client
 * (#874, ADR-0118): the visual gate composes this and never presses the button.
 */
@Composable
internal fun VerifyScreen(
    verify: suspend (String) -> ApiResult<VerifyResult>,
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
        scope.launch { state = VerifyUiState.of(verify(VerifyRepository.normalizeCode(typed))) }
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
                .background(RoyColors.background)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = VerifyMetrics.horizontalPadding),
    ) {
        Text(
            text = VerifyCopy.PAGE_TITLE,
            modifier = Modifier.testTag(VerifyMetrics.TITLE).fillMaxWidth().height(VerifyMetrics.titleHeight),
            style =
                TextStyle(
                    fontSize = VerifyMetrics.titleSize,
                    fontWeight = VerifyMetrics.titleWeight,
                    lineHeight = VerifyMetrics.titleLineHeight,
                    textAlign = TextAlign.Center,
                ),
            color = RoyColors.foreground,
        )

        Spacer(Modifier.height(VerifyMetrics.titleToCard))

        Box(
            modifier =
                Modifier.testTag(VerifyMetrics.CARD)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(VerifyMetrics.cardRadius))
                    .background(RoyColors.card.copy(alpha = 0.8f))
                    .border(
                        1.dp,
                        RoyColors.border.copy(alpha = 0.6f),
                        RoundedCornerShape(VerifyMetrics.cardRadius),
                    )
                    .padding(VerifyMetrics.cardPadding),
        ) {
            Column(modifier = Modifier.padding(VerifyMetrics.cardInner)) {
                Box(
                    modifier =
                        Modifier.testTag(VerifyMetrics.INPUT)
                            .fillMaxWidth()
                            .height(VerifyMetrics.fieldHeight)
                            .clip(RoundedCornerShape(VerifyMetrics.fieldRadius))
                            .background(RoyColors.background.copy(alpha = 0.5f))
                            .border(
                                1.dp,
                                RoyColors.border.copy(alpha = 0.7f),
                                RoundedCornerShape(VerifyMetrics.fieldRadius),
                            )
                            .padding(horizontal = VerifyMetrics.fieldPadding),
                    contentAlignment = Alignment.CenterStart,
                ) {
                    if (code.isEmpty()) {
                        Text(
                            text = VerifyCopy.PLACEHOLDER,
                            style = TextStyle(fontSize = VerifyMetrics.fieldTextSize),
                            color = RoyColors.mutedForeground,
                        )
                    }
                    BasicTextField(
                        value = code,
                        onValueChange = { code = it.uppercase() },
                        singleLine = true,
                        enabled = !busy,
                        textStyle =
                            TextStyle(
                                fontSize = VerifyMetrics.fieldTextSize,
                                color = RoyColors.foreground,
                            ),
                        cursorBrush = SolidColor(RoyColors.primary),
                        keyboardOptions =
                            KeyboardOptions(
                                capitalization = KeyboardCapitalization.Characters,
                                imeAction = ImeAction.Search,
                            ),
                        keyboardActions = KeyboardActions(onSearch = { check() }),
                        modifier = Modifier.fillMaxWidth(),
                    )
                }

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

                Spacer(Modifier.height(VerifyMetrics.fieldToButton))

                Box(
                    modifier =
                        Modifier.testTag(VerifyMetrics.SUBMIT)
                            // The page's disabled submit is `opacity-50`, and a
                            // modifier earlier in the chain is what fades the
                            // gradient too: one after `background` would only fade
                            // the label.
                            .alpha(if (checkable) 1f else 0.5f)
                            .fillMaxWidth()
                            .height(VerifyMetrics.buttonHeight)
                            .clip(RoundedCornerShape(VerifyMetrics.buttonRadius))
                            .background(
                                Brush.horizontalGradient(
                                    listOf(
                                        VerifyMetrics.buttonStart,
                                        VerifyMetrics.buttonMiddle,
                                        VerifyMetrics.buttonEnd,
                                    )
                                )
                            )
                            .clickable(enabled = checkable) { check() },
                    contentAlignment = Alignment.Center,
                ) {
                    Row(
                        horizontalArrangement = Arrangement.spacedBy(8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                    ) {
                        Icon(
                            imageVector =
                                if (busy) LucideVectors.LoaderCircle else LucideVectors.Search,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(VerifyMetrics.buttonIcon),
                        )
                        Text(
                            text = if (busy) VerifyCopy.BUSY_TITLE else VerifyCopy.SUBMIT,
                            style =
                                TextStyle(
                                    fontSize = VerifyMetrics.buttonTextSize,
                                    fontWeight = VerifyMetrics.buttonWeight,
                                ),
                            color = Color.White,
                        )
                    }
                }

                Spacer(Modifier.height(VerifyMetrics.buttonToHint))

                Row(
                    modifier =
                        Modifier.testTag(VerifyMetrics.HINT)
                            .fillMaxWidth()
                            .height(VerifyMetrics.hintHeight)
                            .padding(top = VerifyMetrics.hintTopPadding)
                            .border(
                                width = 1.dp,
                                color = RoyColors.border.copy(alpha = 0.4f),
                                shape = RoundedCornerShape(0.dp),
                            ),
                    horizontalArrangement = Arrangement.SpaceBetween,
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

/**
 * The page's numbers, as one source the screen and its visual test both read
 * (#874, ADR-0118).
 *
 * They are what `/verify` resolves to at 393 x 852: the title at 30/800 with a
 * 46.5 line, 32 between it and the card, the card's 24 radius and its 4 padding
 * around 20, the 52-high field and button at radius 16, and the 77-high hint row.
 * Keeping them here rather than inline is what lets the test measure the numbers
 * the screen draws, so a change to one without the other fails `check:visual`
 * instead of drifting quietly.
 */
internal object VerifyMetrics {
    const val TITLE = "verify-title"
    const val CARD = "verify-card"
    const val INPUT = "verify-input"
    const val SUBMIT = "verify-submit"
    const val HINT = "verify-hint"

    val horizontalPadding = 16.dp
    val titleSize = 30.sp
    val titleLineHeight = 46.5.sp
    val titleHeight = 46.5.dp
    val titleWeight = FontWeight.ExtraBold
    val titleToCard = 32.dp

    val cardRadius = 24.dp
    val cardPadding = 4.dp
    // The page puts 20 inside the card's 1px border; Compose paints the border
    // inside the bounds without consuming space, so the content is inset by 21.
    val cardInner = 21.dp

    val fieldHeight = 52.dp
    val fieldRadius = 16.dp
    val fieldTextSize = 16.sp
    val fieldPadding = 44.dp
    val fieldToButton = 12.dp

    val buttonHeight = 52.dp
    val buttonRadius = 16.dp
    val buttonTextSize = 16.sp
    val buttonWeight = FontWeight.Bold
    val buttonIcon = 20.dp
    val buttonToHint = 16.dp

    val hintHeight = 77.dp
    val hintTopPadding = 16.dp
    val hintTextSize = 12.sp

    /** Tailwind's `purple-600`, `violet-600` and `indigo-600`. */
    val buttonStart = Color(0xFF9333EA)
    val buttonMiddle = Color(0xFF7C3AED)
    val buttonEnd = Color(0xFF4F46E5)
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
