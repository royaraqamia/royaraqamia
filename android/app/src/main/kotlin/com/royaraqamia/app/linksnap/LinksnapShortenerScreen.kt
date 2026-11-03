package com.royaraqamia.app.linksnap

import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
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
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.AnnotatedString
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.store.linksnap.LinksnapLinkRow
import com.royaraqamia.app.store.linksnap.LinksnapRepository
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyShape
import kotlinx.coroutines.launch

/**
 * The site's `/linksnap` as a screen (#654).
 *
 * The page is the shortener and nothing else: a centred title, then one card
 * holding the field's label, the field, the guest sentence and the one button.
 * The owned list is the account page (`/account/links`), which is
 * [LinksnapAccountScreen]; drawing it here too was the first port's mistake.
 *
 * Three rules come straight from the page:
 *
 * - the button is disabled until there is something to shorten, and the page
 *   fades it to half opacity rather than hiding it;
 * - a visitor with no session still gets the form - the sentence under the field
 *   is the site's sign-in prompt, not a gate in front of the card;
 * - the clipboard is the caller's ([onCopy]), because a platform service reached
 *   from a screen is a screen that cannot be drawn in a test.
 */
@Composable
fun LinksnapShortenerScreen(
    repository: LinksnapRepository,
    siteUrl: String,
    signedIn: Boolean,
    modifier: Modifier = Modifier,
    onCopy: (String) -> Unit = {},
    onSignIn: () -> Unit = {},
) {
    LinksnapShortenerScreen(
        shorten = { url ->
            if (signedIn) {
                runCatching { repository.createLink(originalUrl = url) }
                    .fold(
                        onSuccess = { ShortenOutcome.Created(it) },
                        onFailure = { ShortenOutcome.Failed(it.message.orEmpty()) },
                    )
            } else {
                when (val answer = repository.createOnlineLink(originalUrl = url)) {
                    is ApiResult.Success -> ShortenOutcome.Created(answer.value)
                    is ApiResult.Failure -> ShortenOutcome.Failed(messageFor(answer.error))
                }
            }
        },
        siteUrl = siteUrl,
        signedIn = signedIn,
        modifier = modifier,
        onCopy = onCopy,
        onSignIn = onSignIn,
    )
}

/** What one shorten came to: the row, or the sentence to draw in its place. */
internal sealed interface ShortenOutcome {
    data class Created(val link: LinksnapLinkRow) : ShortenOutcome

    data class Failed(val message: String) : ShortenOutcome
}

/**
 * The screen over the one call it makes, so the visual gate can draw it without a
 * client (#874, ADR-0118): the test composes this and never presses the button.
 */
@Composable
internal fun LinksnapShortenerScreen(
    shorten: suspend (String) -> ShortenOutcome,
    siteUrl: String,
    signedIn: Boolean,
    modifier: Modifier = Modifier,
    onCopy: (String) -> Unit = {},
    onSignIn: () -> Unit = {},
) {
    val scope = rememberCoroutineScope()
    var url by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<String?>(null) }
    var created by remember { mutableStateOf<LinksnapLinkRow?>(null) }

    // The page autofocuses the field, so the card at rest carries the focused
    // field: the primary edge and its 2px ring. A native screen that opened
    // without it would be the same boxes and a different picture.
    val fieldInteraction = remember { MutableInteractionSource() }
    val fieldFocused by fieldInteraction.collectIsFocusedAsState()
    val focusRequester = remember { FocusRequester() }

    LaunchedEffect(Unit) { runCatching { focusRequester.requestFocus() } }

    val ready = url.isNotBlank() && !busy

    fun submit() {
        if (!ready) return
        scope.launch {
            busy = true
            notice = null
            when (val answer = shorten(url.trim())) {
                is ShortenOutcome.Created -> {
                    created = answer.link
                    url = ""
                }
                is ShortenOutcome.Failed -> notice = answer.message
            }
            busy = false
        }
    }

    Column(
        modifier =
            modifier
                .fillMaxSize()
                .background(RoyColors.background)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = LinksnapMetrics.horizontalPadding),
    ) {
        Text(
            text = LinksnapPageCopy.PAGE_TITLE,
            modifier =
                Modifier.testTag(LinksnapMetrics.TITLE)
                    .fillMaxWidth()
                    .height(LinksnapMetrics.titleHeight),
            style =
                TextStyle(
                    fontSize = LinksnapMetrics.titleSize,
                    fontWeight = LinksnapMetrics.titleWeight,
                    lineHeight = LinksnapMetrics.titleLineHeight,
                    letterSpacing = LinksnapMetrics.titleTracking,
                    textAlign = TextAlign.Center,
                    brush =
                        Brush.horizontalGradient(
                            listOf(
                                LinksnapMetrics.titleStart,
                                LinksnapMetrics.titleMiddle,
                                LinksnapMetrics.titleEnd,
                            )
                        ),
                ),
        )

        Spacer(Modifier.height(LinksnapMetrics.titleToCard))

        Box(
            modifier =
                Modifier.testTag(LinksnapMetrics.CARD)
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(LinksnapMetrics.cardRadius))
                    .background(RoyColors.card)
                    .border(
                        LinksnapMetrics.cardBorderWidth,
                        RoyColors.border,
                        RoundedCornerShape(LinksnapMetrics.cardRadius),
                    )
                    .padding(LinksnapMetrics.cardInset),
        ) {
            Column(verticalArrangement = Arrangement.spacedBy(LinksnapMetrics.formGap)) {
                Column {
                    Text(
                        text = LinksnapWords.URL_LABEL,
                        modifier =
                            Modifier.testTag(LinksnapMetrics.LABEL)
                                .fillMaxWidth()
                                .height(LinksnapMetrics.labelHeight),
                        style =
                            TextStyle(
                                fontSize = LinksnapMetrics.labelSize,
                                fontWeight = LinksnapMetrics.labelWeight,
                                lineHeight = LinksnapMetrics.labelLineHeight,
                                letterSpacing = LinksnapMetrics.labelTracking,
                            ),
                        color = RoyColors.mutedForeground,
                    )

                    Spacer(Modifier.height(LinksnapMetrics.labelToField))

                    Box(
                        modifier =
                            Modifier.testTag(LinksnapMetrics.INPUT)
                                .fillMaxWidth()
                                .height(LinksnapMetrics.fieldHeight)
                                .clip(RoyShape.pill)
                                .background(RoyColors.muted.copy(alpha = 0.5f))
                                .then(
                                    if (fieldFocused) {
                                        Modifier.drawBehind {
                                            val ring = LinksnapMetrics.focusRing.toPx()
                                            drawRoundRect(
                                                color = RoyColors.primary.copy(alpha = 0.2f),
                                                topLeft = Offset(-ring, -ring),
                                                size = Size(size.width + ring * 2, size.height + ring * 2),
                                                cornerRadius = CornerRadius((size.height + ring * 2) / 2f),
                                                style = Stroke(width = ring),
                                            )
                                        }
                                    } else {
                                        Modifier
                                    }
                                )
                                .border(
                                    LinksnapMetrics.cardBorderWidth,
                                    if (fieldFocused) RoyColors.primary else RoyColors.border,
                                    RoyShape.pill,
                                )
                                .padding(horizontal = LinksnapMetrics.fieldPadding),
                        contentAlignment = Alignment.CenterStart,
                    ) {
                        if (url.isEmpty()) {
                            Text(
                                text = LinksnapWords.URL_PLACEHOLDER,
                                style =
                                    TextStyle(
                                        fontSize = LinksnapMetrics.fieldTextSize,
                                        lineHeight = LinksnapMetrics.fieldLineHeight,
                                    ),
                                color = RoyColors.mutedForeground,
                            )
                        }
                        BasicTextField(
                            value = url,
                            onValueChange = { url = it },
                            singleLine = true,
                            enabled = !busy,
                            textStyle =
                                TextStyle(
                                    fontSize = LinksnapMetrics.fieldTextSize,
                                    lineHeight = LinksnapMetrics.fieldLineHeight,
                                    color = RoyColors.foreground,
                                ),
                            cursorBrush = SolidColor(RoyColors.primary),
                            keyboardOptions =
                                KeyboardOptions(
                                    keyboardType = KeyboardType.Uri,
                                    imeAction = ImeAction.Go,
                                ),
                            keyboardActions = KeyboardActions(onGo = { submit() }),
                            interactionSource = fieldInteraction,
                            modifier = Modifier.fillMaxWidth().focusRequester(focusRequester),
                        )
                    }
                }

                if (!signedIn) {
                    GuestHint(onSignIn = onSignIn)
                }

                notice?.let { message ->
                    Text(
                        text = message,
                        style =
                            TextStyle(
                                fontSize = LinksnapMetrics.hintSize,
                                lineHeight = LinksnapMetrics.hintLineHeight,
                            ),
                        color = RoyColors.destructive,
                    )
                }

                created?.let { link ->
                    Ready(
                        url = "${siteUrl.trimEnd('/')}/${link.code}",
                        onCopy = onCopy,
                        onAgain = { created = null },
                    )
                }

                Box(
                    modifier =
                        Modifier.testTag(LinksnapMetrics.SUBMIT)
                            // The page's disabled button is `opacity-50`, and the
                            // alpha comes before the background so the gradient
                            // fades with the label.
                            .alpha(if (ready) 1f else 0.5f)
                            .fillMaxWidth()
                            .height(LinksnapMetrics.buttonHeight)
                            .clip(RoyShape.pill)
                            .background(Brush.horizontalGradient(colorStops = LinksnapMetrics.buttonStops))
                            .border(
                                LinksnapMetrics.cardBorderWidth,
                                Color.White.copy(alpha = 0.2f),
                                RoyShape.pill,
                            )
                            .clickable(enabled = ready) { submit() },
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text =
                            if (busy) {
                                LinksnapWords.BUSY_SUBMIT
                            } else {
                                LinksnapWords.SUBMIT
                            },
                        style =
                            TextStyle(
                                fontSize = LinksnapMetrics.buttonTextSize,
                                fontWeight = LinksnapMetrics.buttonWeight,
                                lineHeight = LinksnapMetrics.buttonLineHeight,
                            ),
                        color = Color.White,
                    )
                }
            }
        }
    }
}

/**
 * The site's guest sentence and its sign-in link: a paragraph, not a card, and it
 * names the three things a session adds.
 */
@Composable
private fun GuestHint(onSignIn: () -> Unit) {
    Text(
        text =
            buildAnnotatedString {
                append(LinksnapWords.GUEST_HINT)
                append(" ")
                withStyle(SpanStyle(color = RoyColors.primary, fontWeight = FontWeight.Bold)) {
                    append(LinksnapWords.GUEST_SIGN_IN)
                }
            },
        modifier =
            Modifier.testTag(LinksnapMetrics.HINT)
                .fillMaxWidth()
                .height(LinksnapMetrics.hintHeight)
                .clickable(onClick = onSignIn),
        style =
            TextStyle(
                fontSize = LinksnapMetrics.hintSize,
                lineHeight = LinksnapMetrics.hintLineHeight,
                fontWeight = FontWeight.Medium,
            ),
        color = RoyColors.mutedForeground,
    )
}

/** The page's success block: the short URL, its copy action, and the way back. */
@Composable
private fun Ready(url: String, onCopy: (String) -> Unit, onAgain: () -> Unit) {
    Column(verticalArrangement = Arrangement.spacedBy(LinksnapMetrics.formGap)) {
        Text(
            text = LinksnapWords.READY_TITLE,
            style = TextStyle(fontSize = LinksnapMetrics.readyTitleSize, fontWeight = FontWeight.Bold),
            color = RoyColors.foreground,
        )
        Text(
            text = url,
            style = TextStyle(fontSize = LinksnapMetrics.fieldTextSize),
            color = RoyColors.primary,
        )
        Box(
            modifier =
                Modifier.fillMaxWidth()
                    .height(LinksnapMetrics.buttonHeight)
                    .clip(RoyShape.pill)
                    .background(RoyColors.muted.copy(alpha = 0.5f))
                    .border(LinksnapMetrics.cardBorderWidth, RoyColors.border, RoyShape.pill)
                    .clickable { onCopy(url) },
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = LinksnapWords.COPY_ACTION,
                style = TextStyle(fontSize = LinksnapMetrics.hintSize, fontWeight = FontWeight.Bold),
                color = RoyColors.foreground,
            )
        }
        Text(
            text = LinksnapWords.AGAIN_ACTION,
            modifier = Modifier.fillMaxWidth().clickable(onClick = onAgain),
            style = TextStyle(fontSize = LinksnapMetrics.hintSize, fontWeight = FontWeight.Bold),
            color = RoyColors.mutedForeground,
            textAlign = TextAlign.Center,
        )
    }
}

/**
 * The page's numbers, as one source the screen and its visual test both read
 * (#874, ADR-0118).
 *
 * They are what `/linksnap` resolves to at 393 x 852 CSS px: the 30/800 title with
 * its 46.5 line and the 4.5 the highlight's `py-[0.15em]` adds, the 48 between it
 * and the card, the card's 24 radius and 20 padding, the 50-high pill field at 16
 * horizontal padding, and the 52-high pill button.
 *
 * `paddingTop` is the stylesheet's own number; the content sits one pixel further
 * in because Compose paints the border inside the bounds, which is where the page
 * puts it too.
 */
/**
 * The shortener's words, until the component is ported whole (#654).
 *
 * They are the site's strings, but they are not in `shared/copy` yet: a copy
 * source is claimed by a parity row, and a row over `single-url-shortener.tsx`
 * demands every glyph that component imports - the success view's share, QR and
 * lock marks, and the signed-in slug check's offline mark - which this slice does
 * not draw. The extraction lands with those states, and this object goes with it.
 * It sits here rather than spread through the composables so that move is one file.
 */
private object LinksnapWords {
    const val URL_LABEL = "الرَّابط"
    const val URL_PLACEHOLDER = "https://example.com/very-long-url-path"
    const val GUEST_HINT = "سجِّل الدُّخول لاستخدام رمزٍ مخصَّص وكلمة مرور وتتبُّع النَّقرات."
    const val GUEST_SIGN_IN = "تسجيل الدُّخول"
    const val SUBMIT = "اختصار الرَّابط"
    const val BUSY_SUBMIT = "جاري الاختصار..."
    const val READY_TITLE = "رابطك المُختصَر جاهز!"
    const val COPY_ACTION = "نسخ الرَّابط"
    const val AGAIN_ACTION = "اختصار رابط آخر"
}

internal object LinksnapMetrics {
    const val TITLE = "linksnap-title"
    const val CARD = "linksnap-card"
    const val LABEL = "linksnap-label"
    const val INPUT = "linksnap-input"
    const val HINT = "linksnap-hint"
    const val SUBMIT = "linksnap-submit"

    val horizontalPadding = 16.dp

    val titleSize = 30.sp
    val titleLineHeight = 46.5.sp
    val titleHeight = 46.5.dp
    val titleWeight = FontWeight.ExtraBold
    val titleTracking = (-0.025).em
    val titleToCard = 48.dp

    val cardRadius = 24.dp
    val cardPadding = 20.dp
    val cardInset = 21.dp
    val cardBorderWidth = 1.dp

    val formGap = 20.dp

    val labelSize = 12.sp
    val labelLineHeight = 16.sp
    val labelHeight = 16.dp
    val labelWeight = FontWeight.Bold
    val labelTracking = 0.05.em
    val labelToField = 8.dp

    val fieldHeight = 50.dp
    val fieldTextSize = 14.sp
    val fieldLineHeight = 20.sp
    val fieldPadding = 16.dp
    val focusRing = 2.dp

    val hintHeight = 32.dp
    val hintSize = 12.sp
    val hintLineHeight = 16.sp

    val buttonHeight = 52.dp
    val buttonTextSize = 16.sp
    val buttonLineHeight = 24.sp
    val buttonWeight = FontWeight.Bold

    val readyTitleSize = 20.sp

    /**
     * The hero button's gradient, as the page paints it: Tailwind 4's
     * `from-purple-600 via-violet-600 to-indigo-600` interpolated `in oklab`,
     * sampled at nine points because Compose lerps in sRGB. The values are the
     * palette's own OKLCH converted to sRGB - the stylesheet's v4 palette is more
     * saturated than the v3 hexes this used to carry, which is what made the
     * button the only part of the card the raster disagreed about.
     */
    val buttonStops: Array<Pair<Float, Color>> =
        arrayOf(
            0.000f to Color(0xFF9810FA),
            0.125f to Color(0xFF9216FB),
            0.250f to Color(0xFF8C1BFC),
            0.375f to Color(0xFF861FFD),
            0.500f to Color(0xFF7F22FE),
            0.625f to Color(0xFF742AFC),
            0.750f to Color(0xFF6930FA),
            0.875f to Color(0xFF5D35F8),
            1.000f to Color(0xFF4F39F6),
        )

    /** Tailwind's `violet-400`, `fuchsia-400` and `indigo-400`, the title's gradient. */
    val titleStart = Color(0xFFA684FF)
    val titleMiddle = Color(0xFFED6AFF)
    val titleEnd = Color(0xFF7C86FF)
}
