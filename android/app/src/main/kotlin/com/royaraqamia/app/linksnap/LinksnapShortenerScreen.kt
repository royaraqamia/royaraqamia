package com.royaraqamia.app.linksnap

import android.graphics.Bitmap
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
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
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.SpanStyle
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.buildAnnotatedString
import androidx.compose.ui.text.withStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.LinksnapAvailabilityResponseAvailability
import com.royaraqamia.app.net.Connectivity
import com.royaraqamia.app.store.linksnap.LinksnapLinkRow
import com.royaraqamia.app.store.linksnap.LinksnapRepository
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyShape
import com.royaraqamia.app.ui.vectors.LucideVectors
import com.royaraqamia.app.verify.VerifyQrCode
import java.net.URI
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * The site's `/linksnap` as a screen (#654, #916).
 *
 * The page is the shortener and nothing else: a centred title, then one card
 * holding the field's label, the field, the guest sentence or the signed-in
 * custom-code and password blocks, and the one button. The success block
 * replaces the form and offers the page's three actions. The owned list is the
 * account page (`/account/links`), which is [LinksnapAccountScreen]; drawing it
 * here too was the first port's mistake.
 *
 * Three rules come straight from the page:
 *
 * - the button is disabled until there is something to shorten, and the page
 *   fades it to half opacity rather than hiding it;
 * - a visitor with no session still gets the form - the sentence under the field
 *   is the site's sign-in prompt, not a gate in front of the card;
 * - the clipboard and the share sheet are the caller's ([onCopy], [onShare]),
 *   because a platform service reached from a screen is a screen that cannot be
 *   drawn in a test.
 */
@Composable
fun LinksnapShortenerScreen(
    repository: LinksnapRepository,
    siteUrl: String,
    signedIn: Boolean,
    modifier: Modifier = Modifier,
    onCopy: (String) -> Unit = {},
    onShare: (String) -> Unit = {},
    onSignIn: () -> Unit = {},
) {
    LinksnapShortenerScreen(
        shorten = { url, customCode, password ->
            if (signedIn) {
                runCatching {
                        repository.createLink(
                            originalUrl = url,
                            customCode = customCode,
                            password = password,
                        )
                    }
                    .fold(
                        onSuccess = { ShortenOutcome.Created(it) },
                        onFailure = { ShortenOutcome.Failed(it.message.orEmpty()) },
                    )
            } else {
                when (
                    val answer =
                        repository.createOnlineLink(
                            originalUrl = url,
                            customCode = customCode,
                            password = password,
                        )
                ) {
                    is ApiResult.Success -> ShortenOutcome.Created(answer.value)
                    is ApiResult.Failure -> ShortenOutcome.Failed(messageFor(answer.error))
                }
            }
        },
        checkAvailability = { code -> repository.checkAvailability(code) },
        siteUrl = siteUrl,
        signedIn = signedIn,
        modifier = modifier,
        onCopy = onCopy,
        onShare = onShare,
        onSignIn = onSignIn,
    )
}

/** The debounce the site's hook applies before asking about a custom code. */
private const val SLUG_DEBOUNCE_MS = 400L

/** The page's copy confirmation lasts two seconds. */
private const val COPIED_MARK_MS = 2_000L

/** What one shorten came to: the row, or the sentence to draw in its place. */
internal sealed interface ShortenOutcome {
    data class Created(val link: LinksnapLinkRow) : ShortenOutcome

    data class Failed(val message: String) : ShortenOutcome
}

/** The four answers the site's custom-code check draws (#916). */
internal sealed interface SlugStatus {
    data object Idle : SlugStatus

    data object Checking : SlugStatus

    data object Available : SlugStatus

    data object Offline : SlugStatus

    data class Taken(val message: String?) : SlugStatus
}

/**
 * The screen over the calls it makes, so the visual gate can draw it without a
 * client (#874, ADR-0118): the test composes this and never presses the button.
 */
@Composable
internal fun LinksnapShortenerScreen(
    shorten: suspend (String, String?, String?) -> ShortenOutcome,
    checkAvailability: suspend (String) -> ApiResult<LinksnapAvailabilityResponseAvailability>,
    siteUrl: String,
    signedIn: Boolean,
    modifier: Modifier = Modifier,
    onCopy: (String) -> Unit = {},
    onShare: (String) -> Unit = {},
    onSignIn: () -> Unit = {},
) {
    val context = LocalContext.current
    val scope = rememberCoroutineScope()
    var online by remember { mutableStateOf(Connectivity.isOnline(context)) }
    var url by remember { mutableStateOf("") }
    var customCode by remember { mutableStateOf("") }
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var notice by remember { mutableStateOf<String?>(null) }
    var created by remember { mutableStateOf<LinksnapLinkRow?>(null) }
    var slugStatus by remember { mutableStateOf<SlugStatus>(SlugStatus.Idle) }
    var copied by remember { mutableStateOf(false) }
    var qrOpen by remember { mutableStateOf(false) }

    // The page autofocuses the field, so the card at rest carries the focused
    // field: the primary edge and its 2px ring. A native screen that opened
    // without it would be the same boxes and a different picture.
    val fieldInteraction = remember { MutableInteractionSource() }
    val fieldFocused by fieldInteraction.collectIsFocusedAsState()
    val focusRequester = remember { FocusRequester() }

    LaunchedEffect(created) {
        if (created == null) runCatching { focusRequester.requestFocus() }
    }

    // The page's `useOnline` re-runs its check when the radio returns, so the
    // sentence does not stay "offline" after a reconnect. The watch is the
    // platform's own signal, not a request that would fail to discover it.
    DisposableEffect(context) {
        val watch = Connectivity.watch(context) { online = true }
        onDispose { watch.close() }
    }

    // The site's own availability check: only a signed-in member sees the field,
    // nothing shorter than three characters is asked about, and the radio decides
    // "offline" rather than a request that would spend the debounce and fail.
    LaunchedEffect(customCode, signedIn, online) {
        if (!signedIn) {
            slugStatus = SlugStatus.Idle
            return@LaunchedEffect
        }
        val slug = sanitizeCode(customCode)
        if (slug.length < LinksnapRepository.MIN_CODE_LENGTH) {
            slugStatus = SlugStatus.Idle
            return@LaunchedEffect
        }
        if (!online) {
            slugStatus = SlugStatus.Offline
            return@LaunchedEffect
        }
        slugStatus = SlugStatus.Checking
        delay(SLUG_DEBOUNCE_MS)
        slugStatus =
            when (val answer = checkAvailability(slug)) {
                is ApiResult.Success ->
                    if (answer.value.available) {
                        SlugStatus.Available
                    } else {
                        SlugStatus.Taken(answer.value.error)
                    }
                is ApiResult.Failure ->
                    when (answer.error) {
                        is ApiError.Network -> SlugStatus.Offline
                        else -> SlugStatus.Idle
                    }
            }
    }

    val canSubmit = url.isNotBlank() && !busy

    fun submit() {
        if (!canSubmit) return
        val destination = url.trim()
        if (!isHttpUrl(destination)) {
            notice = LinksnapShortenerCopy.INVALID_URL
            return
        }
        val code = if (signedIn) sanitizeCode(customCode).takeIf { it.isNotEmpty() } else null
        val pass = if (signedIn) password.takeIf { it.isNotEmpty() } else null
        scope.launch {
            busy = true
            notice = null
            when (val answer = shorten(destination, code, pass)) {
                is ShortenOutcome.Created -> {
                    created = answer.link
                    url = ""
                    copied = false
                    qrOpen = false
                }
                is ShortenOutcome.Failed -> notice = answer.message
            }
            busy = false
        }
    }

    fun reset() {
        url = ""
        customCode = ""
        password = ""
        created = null
        notice = null
        slugStatus = SlugStatus.Idle
        copied = false
        qrOpen = false
    }

    val state = LinksnapShortenerUiState.of(signedIn, created != null)

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
                when (state) {
                    LinksnapShortenerUiState.Ready ->
                        created?.let { link ->
                            val shortUrl = "${siteUrl.trimEnd('/')}/${link.code}"
                            ReadyBlock(
                                shortUrl = shortUrl,
                                originalUrl = link.originalUrl,
                                protected = link.passwordProtected,
                                copied = copied,
                                onCopy = {
                                    onCopy(shortUrl)
                                    copied = true
                                },
                                onShare = { onShare(shortUrl) },
                                onQr = { qrOpen = !qrOpen },
                                onAgain = ::reset,
                            )
                        }
                    LinksnapShortenerUiState.Guest,
                    LinksnapShortenerUiState.SignedIn -> {
                        UrlBlock(
                            url = url,
                            onUrlChange = { url = it },
                            busy = busy,
                            focused = fieldFocused,
                            interaction = fieldInteraction,
                            focusRequester = focusRequester,
                            onSubmit = ::submit,
                        )

                        if (state == LinksnapShortenerUiState.Guest) {
                            GuestHint(onSignIn = onSignIn)
                        } else {
                            SignedInFields(
                                siteUrl = siteUrl,
                                customCode = customCode,
                                onCustomCodeChange = { input ->
                                    customCode = sanitizeCode(input)
                                },
                                password = password,
                                onPasswordChange = { password = it },
                                status = slugStatus,
                            )
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

                        Box(
                            modifier =
                                Modifier.testTag(LinksnapMetrics.SUBMIT)
                                    // The page's disabled button is `opacity-50`, and the
                                    // alpha comes before the background so the gradient
                                    // fades with the label.
                                    .alpha(if (canSubmit) 1f else 0.5f)
                                    .fillMaxWidth()
                                    .height(LinksnapMetrics.buttonHeight)
                                    .clip(RoyShape.pill)
                                    .background(
                                        Brush.horizontalGradient(colorStops = LinksnapMetrics.buttonStops)
                                    )
                                    .border(
                                        LinksnapMetrics.cardBorderWidth,
                                        Color.White.copy(alpha = 0.2f),
                                        RoyShape.pill,
                                    )
                                    .clickable(enabled = canSubmit) { submit() },
                            contentAlignment = Alignment.Center,
                        ) {
                            Text(
                                text =
                                    if (busy) {
                                        LinksnapShortenerCopy.BUSY_SUBMIT
                                    } else {
                                        LinksnapShortenerCopy.SUBMIT
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
    }

    if (qrOpen) {
        created?.let { link ->
            QrDialog(
                url = "${siteUrl.trimEnd('/')}/${link.code}",
                onDismiss = { qrOpen = false },
            )
        }
    }

    // The copied mark is the page's two-second confirmation, not a permanent label.
    LaunchedEffect(copied) {
        if (copied) {
            delay(COPIED_MARK_MS)
            copied = false
        }
    }
}

/** The page's URL label and its one field, focused on arrival. */
@Composable
private fun UrlBlock(
    url: String,
    onUrlChange: (String) -> Unit,
    busy: Boolean,
    focused: Boolean,
    interaction: MutableInteractionSource,
    focusRequester: FocusRequester,
    onSubmit: () -> Unit,
) {
    Column {
        FieldLabel(
            text = LinksnapShortenerCopy.URL_LABEL,
            tag = LinksnapMetrics.LABEL,
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
                        if (focused) {
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
                        if (focused) RoyColors.primary else RoyColors.border,
                        RoyShape.pill,
                    )
                    .padding(horizontal = LinksnapMetrics.fieldPadding),
            contentAlignment = Alignment.CenterStart,
        ) {
            if (url.isEmpty()) {
                Text(
                    text = LinksnapShortenerCopy.URL_PLACEHOLDER,
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
                onValueChange = onUrlChange,
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
                keyboardActions = KeyboardActions(onGo = { onSubmit() }),
                interactionSource = interaction,
                modifier = Modifier.fillMaxWidth().focusRequester(focusRequester),
            )
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
                append(LinksnapShortenerCopy.GUEST_HINT)
                append(" ")
                withStyle(SpanStyle(color = RoyColors.primary, fontWeight = FontWeight.Bold)) {
                    append(LinksnapShortenerCopy.GUEST_SIGN_IN)
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

/**
 * The signed-in half of the page's form: the custom code with the site's own
 * availability answers, then the optional password.
 *
 * The numbers are the page's own box: a 16-high label, 4 to its field, 6 to the
 * hint, 14 to the password label (the `space-y-1.5` plus the block's `pt-2`),
 * 4 to its 46-high field.
 */
@Composable
private fun SignedInFields(
    siteUrl: String,
    customCode: String,
    onCustomCodeChange: (String) -> Unit,
    password: String,
    onPasswordChange: (String) -> Unit,
    status: SlugStatus,
) {
    Column {
        FieldLabel(
            text = LinksnapShortenerCopy.CUSTOM_LABEL,
            tag = LinksnapMetrics.CUSTOM_LABEL,
        )

        Spacer(Modifier.height(LinksnapMetrics.customLabelToField))

        Row(
            modifier =
                Modifier.testTag(LinksnapMetrics.CUSTOM_FIELD)
                    .fillMaxWidth()
                    .height(LinksnapMetrics.customFieldHeight)
                    .clip(RoyShape.pill)
                    .background(RoyColors.muted.copy(alpha = 0.5f))
                    .border(
                        LinksnapMetrics.cardBorderWidth,
                        RoyColors.border,
                        RoyShape.pill,
                    )
                    .padding(horizontal = LinksnapMetrics.customFieldPadding),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = "${siteUrl.trimEnd('/')}/",
                style =
                    TextStyle(
                        fontSize = LinksnapMetrics.fieldTextSize,
                        fontWeight = FontWeight.Bold,
                    ),
                color = RoyColors.mutedForeground,
                maxLines = 1,
                overflow = TextOverflow.Clip,
            )
            Box(
                modifier = Modifier.weight(1f).padding(start = LinksnapMetrics.customFieldPrefix),
                contentAlignment = Alignment.CenterStart,
            ) {
                if (customCode.isEmpty()) {
                    Text(
                        text = LinksnapShortenerCopy.CUSTOM_PLACEHOLDER,
                        style =
                            TextStyle(
                                fontSize = LinksnapMetrics.fieldTextSize,
                                lineHeight = LinksnapMetrics.fieldLineHeight,
                            ),
                        color = RoyColors.mutedForeground,
                    )
                }
                BasicTextField(
                    value = customCode,
                    onValueChange = onCustomCodeChange,
                    singleLine = true,
                    textStyle =
                        TextStyle(
                            fontSize = LinksnapMetrics.fieldTextSize,
                            lineHeight = LinksnapMetrics.fieldLineHeight,
                            color = RoyColors.foreground,
                        ),
                    cursorBrush = SolidColor(RoyColors.primary),
                    keyboardOptions =
                        KeyboardOptions(
                            keyboardType = KeyboardType.Text,
                            imeAction = ImeAction.Next,
                        ),
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }

        Spacer(Modifier.height(LinksnapMetrics.customFieldToHint))

        Text(
            text = LinksnapShortenerCopy.CUSTOM_HINT,
            modifier =
                Modifier.testTag(LinksnapMetrics.CUSTOM_HINT)
                    .fillMaxWidth()
                    .height(LinksnapMetrics.labelHeight),
            style =
                TextStyle(
                    fontSize = LinksnapMetrics.hintSize,
                    lineHeight = LinksnapMetrics.hintLineHeight,
                    fontWeight = FontWeight.Medium,
                ),
            color = RoyColors.mutedForeground,
        )

        AvailabilityLine(status)

        Spacer(Modifier.height(LinksnapMetrics.customHintToPassword))

        FieldLabel(
            text = LinksnapShortenerCopy.PASSWORD_LABEL,
            tag = LinksnapMetrics.PASSWORD_LABEL,
        )

        Spacer(Modifier.height(LinksnapMetrics.passwordLabelToField))

        Box(
            modifier =
                Modifier.testTag(LinksnapMetrics.PASSWORD_FIELD)
                    .fillMaxWidth()
                    .height(LinksnapMetrics.passwordFieldHeight)
                    .clip(RoyShape.pill)
                    .background(RoyColors.muted.copy(alpha = 0.5f))
                    .border(
                        LinksnapMetrics.cardBorderWidth,
                        RoyColors.border,
                        RoyShape.pill,
                    )
                    .padding(horizontal = LinksnapMetrics.fieldPadding),
            contentAlignment = Alignment.CenterStart,
        ) {
            if (password.isEmpty()) {
                Text(
                    text = LinksnapShortenerCopy.PASSWORD_PLACEHOLDER,
                    style =
                        TextStyle(
                            fontSize = LinksnapMetrics.fieldTextSize,
                            lineHeight = LinksnapMetrics.fieldLineHeight,
                        ),
                    color = RoyColors.mutedForeground,
                )
            }
            BasicTextField(
                value = password,
                onValueChange = onPasswordChange,
                singleLine = true,
                visualTransformation = PasswordVisualTransformation(),
                textStyle =
                    TextStyle(
                        fontSize = LinksnapMetrics.fieldTextSize,
                        lineHeight = LinksnapMetrics.fieldLineHeight,
                        color = RoyColors.foreground,
                    ),
                cursorBrush = SolidColor(RoyColors.primary),
                keyboardOptions =
                    KeyboardOptions(
                        keyboardType = KeyboardType.Password,
                        imeAction = ImeAction.Done,
                    ),
                modifier = Modifier.fillMaxWidth(),
            )
        }
    }
}

/** The custom-code check's four answers, drawn exactly as the page words them. */
@Composable
private fun AvailabilityLine(status: SlugStatus) {
    val view =
        when (status) {
            SlugStatus.Idle -> return
            SlugStatus.Checking ->
                AvailabilityLineView(
                    color = RoyColors.mutedForeground,
                    message = LinksnapShortenerCopy.CHECKING,
                    spinner = true,
                )
            SlugStatus.Available ->
                AvailabilityLineView(
                    color = RoyColors.success,
                    message = LinksnapShortenerCopy.AVAILABLE,
                    icon = LucideVectors.Check,
                )
            SlugStatus.Offline ->
                AvailabilityLineView(
                    color = RoyColors.mutedForeground,
                    message = LinksnapShortenerCopy.OFFLINE,
                    icon = LucideVectors.CloudOff,
                )
            is SlugStatus.Taken ->
                AvailabilityLineView(
                    color = RoyColors.destructive,
                    message = status.message ?: LinksnapShortenerCopy.TAKEN_FALLBACK,
                )
        }

    Row(
        modifier = Modifier.testTag(LinksnapMetrics.STATUS).padding(top = LinksnapMetrics.statusGap),
        horizontalArrangement = Arrangement.spacedBy(LinksnapMetrics.statusGap),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        when {
            view.spinner ->
                CircularProgressIndicator(
                    modifier = Modifier.size(LinksnapMetrics.statusIconSize),
                    color = view.color,
                    strokeWidth = 2.dp,
                )
            view.icon != null -> StatusIcon(view.icon, view.color)
            else ->
                Text(
                    text = "\u2715",
                    style = TextStyle(fontSize = LinksnapMetrics.hintSize),
                    color = view.color,
                )
        }
        Text(
            text = view.message,
            style =
                TextStyle(
                    fontSize = LinksnapMetrics.hintSize,
                    lineHeight = LinksnapMetrics.hintLineHeight,
                    fontWeight = FontWeight.Bold,
                ),
            color = view.color,
        )
    }
}

/** One presentation of the custom-code check, so the line has a single switch. */
private data class AvailabilityLineView(
    val color: Color,
    val message: String,
    val icon: androidx.compose.ui.graphics.vector.ImageVector? = null,
    val spinner: Boolean = false,
)

@Composable
private fun StatusIcon(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    color: Color,
) {
    Image(
        imageVector = icon,
        contentDescription = null,
        colorFilter = androidx.compose.ui.graphics.ColorFilter.tint(color),
        modifier = Modifier.size(LinksnapMetrics.statusIconSize),
    )
}

/** The page's success block: the ready title, the destination, the URL and its actions. */
@Composable
private fun ReadyBlock(
    shortUrl: String,
    originalUrl: String,
    protected: Boolean,
    copied: Boolean,
    onCopy: () -> Unit,
    onShare: () -> Unit,
    onQr: () -> Unit,
    onAgain: () -> Unit,
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(LinksnapMetrics.readyGap),
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(LinksnapMetrics.readyGap),
        ) {
            Box(
                modifier =
                    Modifier.size(LinksnapMetrics.readyMark)
                        .clip(RoyShape.pill)
                        .background(RoyColors.primary.copy(alpha = 0.1f)),
                contentAlignment = Alignment.Center,
            ) {
                Image(
                    imageVector = LucideVectors.Check,
                    contentDescription = null,
                    colorFilter = androidx.compose.ui.graphics.ColorFilter.tint(RoyColors.primary),
                    modifier = Modifier.size(LinksnapMetrics.readyMarkIcon),
                )
            }
            Text(
                text = LinksnapShortenerCopy.READY_TITLE,
                style =
                    TextStyle(
                        fontSize = LinksnapMetrics.readyTitleSize,
                        fontWeight = FontWeight.Bold,
                    ),
                color = RoyColors.foreground,
                textAlign = TextAlign.Center,
            )
            Text(
                text =
                    buildAnnotatedString {
                        withStyle(SpanStyle(color = RoyColors.mutedForeground)) {
                            append(LinksnapShortenerCopy.REDIRECT_LEAD)
                            append(" ")
                        }
                        withStyle(SpanStyle(color = RoyColors.primary)) {
                            append(originalUrl)
                        }
                    },
                modifier = Modifier.fillMaxWidth(),
                style = TextStyle(fontSize = LinksnapMetrics.hintSize),
                color = RoyColors.mutedForeground,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
            if (protected) {
                Row(
                    modifier =
                        Modifier.clip(RoyShape.pill)
                            .background(RoyColors.primary.copy(alpha = 0.1f))
                            .border(
                                LinksnapMetrics.cardBorderWidth,
                                RoyColors.primary.copy(alpha = 0.2f),
                                RoyShape.pill,
                            )
                            .padding(
                                horizontal = LinksnapMetrics.protectedBadgePadding,
                                vertical = LinksnapMetrics.protectedBadgeVertical,
                            ),
                    horizontalArrangement = Arrangement.spacedBy(LinksnapMetrics.statusGap),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Image(
                        imageVector = LucideVectors.LockOpen,
                        contentDescription = null,
                        colorFilter =
                            androidx.compose.ui.graphics.ColorFilter.tint(RoyColors.primary),
                        modifier = Modifier.size(LinksnapMetrics.statusIconSize),
                    )
                    Text(
                        text = LinksnapShortenerCopy.PROTECTED_BADGE,
                        style =
                            TextStyle(
                                fontSize = LinksnapMetrics.hintSize,
                                fontWeight = FontWeight.Bold,
                            ),
                        color = RoyColors.primary,
                    )
                }
            }
        }

        Box(
            modifier =
                Modifier.fillMaxWidth()
                    .clip(RoyShape.pill)
                    .background(RoyColors.muted.copy(alpha = 0.5f))
                    .border(LinksnapMetrics.cardBorderWidth, RoyColors.border, RoyShape.pill)
                    .padding(
                        horizontal = LinksnapMetrics.fieldPadding,
                        vertical = LinksnapMetrics.readyUrlPadding,
                    ),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = shortUrl,
                style =
                    TextStyle(
                        fontSize = LinksnapMetrics.fieldTextSize,
                        fontWeight = FontWeight.Bold,
                    ),
                color = RoyColors.foreground,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }

        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(LinksnapMetrics.actionGap),
        ) {
            ReadyAction(
                label =
                    if (copied) {
                        LinksnapShortenerCopy.COPIED_ACTION
                    } else {
                        LinksnapShortenerCopy.COPY_ACTION
                    },
                icon = if (copied) LucideVectors.Check else LucideVectors.Copy,
                tint = if (copied) RoyColors.success else RoyColors.mutedForeground,
                labelColor = if (copied) RoyColors.success else RoyColors.foreground,
                modifier = Modifier.weight(1f),
                onClick = onCopy,
            )
            ReadyAction(
                label = LinksnapShortenerCopy.SHARE_ACTION,
                icon = LucideVectors.Share2,
                tint = RoyColors.mutedForeground,
                labelColor = RoyColors.foreground,
                modifier = Modifier.weight(1f),
                onClick = onShare,
            )
            ReadyAction(
                label = LinksnapShortenerCopy.QR_ACTION,
                icon = LucideVectors.QrCode,
                tint = RoyColors.mutedForeground,
                labelColor = RoyColors.foreground,
                modifier = Modifier.weight(1f),
                onClick = onQr,
            )
        }

        Row(
            modifier =
                Modifier.fillMaxWidth()
                    .height(LinksnapMetrics.buttonHeight)
                    .clip(RoyShape.pill)
                    .background(RoyColors.muted.copy(alpha = 0.5f))
                    .border(LinksnapMetrics.cardBorderWidth, RoyColors.border, RoyShape.pill)
                    .clickable(onClick = onAgain),
            horizontalArrangement = Arrangement.Center,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Image(
                imageVector = LucideVectors.RotateCcw,
                contentDescription = null,
                colorFilter = androidx.compose.ui.graphics.ColorFilter.tint(RoyColors.mutedForeground),
                modifier = Modifier.size(LinksnapMetrics.statusIconSize),
            )
            Spacer(Modifier.width(LinksnapMetrics.statusGap))
            Text(
                text = LinksnapShortenerCopy.AGAIN_ACTION,
                style =
                    TextStyle(
                        fontSize = LinksnapMetrics.hintSize,
                        fontWeight = FontWeight.Bold,
                    ),
                color = RoyColors.mutedForeground,
            )
        }
    }
}

/** One of the success block's three actions: an outlined pill with a glyph and its word. */
@Composable
private fun ReadyAction(
    label: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    tint: Color,
    labelColor: Color,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Column(
        modifier =
            modifier
                .clip(RoyShape.pill)
                .background(RoyColors.muted.copy(alpha = 0.5f))
                .border(LinksnapMetrics.cardBorderWidth, RoyColors.border, RoyShape.pill)
                .clickable(onClick = onClick)
                .padding(vertical = LinksnapMetrics.actionPadding),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(LinksnapMetrics.actionGap / 2),
    ) {
        Image(
            imageVector = icon,
            contentDescription = null,
            colorFilter = androidx.compose.ui.graphics.ColorFilter.tint(tint),
            modifier = Modifier.size(LinksnapMetrics.actionIconSize),
        )
        Text(
            text = label,
            style =
                TextStyle(
                    fontSize = LinksnapMetrics.hintSize,
                    fontWeight = FontWeight.Medium,
                ),
            color = labelColor,
            textAlign = TextAlign.Center,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis,
        )
    }
}

/** The short link as a QR the member can hold up to another phone (#916). */
@Composable
private fun QrDialog(url: String, onDismiss: () -> Unit) {
    val matrix by produceState<Bitmap?>(initialValue = null, url) {
        value =
            withContext(Dispatchers.Default) {
                VerifyQrCode.matrix(url)?.let { encoded ->
                    val width = encoded.width
                    val pixels =
                        IntArray(width * width) { index ->
                            if (encoded.get(index % width, index / width)) {
                                android.graphics.Color.BLACK
                            } else {
                                android.graphics.Color.WHITE
                            }
                        }
                    Bitmap.createBitmap(pixels, width, width, Bitmap.Config.ARGB_8888)
                }
            }
    }

    Dialog(onDismissRequest = onDismiss) {
        Column(
            modifier =
                Modifier.clip(RoundedCornerShape(LinksnapMetrics.cardRadius))
                    .background(RoyColors.card)
                    .border(
                        LinksnapMetrics.cardBorderWidth,
                        RoyColors.border,
                        RoundedCornerShape(LinksnapMetrics.cardRadius),
                    )
                    .padding(LinksnapMetrics.cardPadding),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(LinksnapMetrics.statusGap),
        ) {
            matrix?.let { bitmap ->
                Image(
                    bitmap = bitmap.asImageBitmap(),
                    contentDescription = LinksnapShortenerCopy.QR_HINT,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.size(LinksnapMetrics.qrSize),
                )
            }
            Text(
                text = LinksnapShortenerCopy.QR_HINT,
                style = TextStyle(fontSize = LinksnapMetrics.hintSize, fontWeight = FontWeight.Bold),
                color = RoyColors.primary,
                textAlign = TextAlign.Center,
            )
        }
    }
}

/** The label every field in the card shares: 12 bold, 16 high, muted. */
@Composable
private fun FieldLabel(text: String, tag: String) {
    Text(
        text = text,
        modifier =
            Modifier.testTag(tag)
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
}

/** The page's URL rule: a real http(s) destination, not a bare word. */
internal fun isHttpUrl(value: String): Boolean {
    val parsed = runCatching { URI(value.trim()) }.getOrNull() ?: return false
    return (parsed.scheme == "http" || parsed.scheme == "https") && !parsed.host.isNullOrBlank()
}

/** The page's sanitizer: `[a-zA-Z0-9_-]`, sixteen at most. */
internal fun sanitizeCode(value: String): String =
    value.replace(Regex("[^a-zA-Z0-9_-]"), "").take(LinksnapRepository.MAX_CODE_LENGTH)

/**
 * The page's numbers, as one source the screen and its visual test both read
 * (#874, ADR-0118).
 *
 * They are what `/linksnap` resolves to at 393 x 852 CSS px: the 30/800 title with
 * its 46.5 line and the 4.5 the highlight's `py-[0.15em]` adds, the 48 between it
 * and the card, the card's 24 radius and 20 padding, the 50-high pill field at 16
 * horizontal padding, and the 52-high pill button. The signed-in half adds the
 * page's 50-high custom field and 46-high password field with the gaps the form
 * declares (4/6/14/4), which is what makes the card 380 high with a session.
 *
 * `paddingTop` is the stylesheet's own number; the content sits one pixel further
 * in because Compose paints the border inside the bounds, which is where the page
 * puts it too.
 */
internal object LinksnapMetrics {
    const val TITLE = "linksnap-title"
    const val CARD = "linksnap-card"
    const val LABEL = "linksnap-label"
    const val INPUT = "linksnap-input"
    const val HINT = "linksnap-hint"
    const val CUSTOM_LABEL = "linksnap-custom-label"
    const val CUSTOM_FIELD = "linksnap-custom-field"
    const val CUSTOM_HINT = "linksnap-custom-hint"
    const val PASSWORD_LABEL = "linksnap-password-label"
    const val PASSWORD_FIELD = "linksnap-password-field"
    const val STATUS = "linksnap-status"
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

    val customFieldHeight = 50.dp
    val customFieldPadding = 12.dp
    val customFieldPrefix = 12.dp
    val customLabelToField = 4.dp
    val customFieldToHint = 6.dp
    val customHintToPassword = 14.dp
    val passwordFieldHeight = 46.dp
    val passwordLabelToField = 4.dp
    val statusGap = 6.dp
    val statusIconSize = 14.dp

    val hintHeight = 32.dp
    val hintSize = 12.sp
    val hintLineHeight = 16.sp

    val buttonHeight = 52.dp
    val buttonTextSize = 16.sp
    val buttonLineHeight = 24.sp
    val buttonWeight = FontWeight.Bold

    val readyTitleSize = 20.sp
    val readyGap = 12.dp
    val readyMark = 48.dp
    val readyMarkIcon = 24.dp
    val readyUrlPadding = 12.dp
    val protectedBadgePadding = 12.dp
    val protectedBadgeVertical = 4.dp
    val actionGap = 12.dp
    val actionPadding = 12.dp
    val actionIconSize = 16.dp
    val qrSize = 180.dp

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
