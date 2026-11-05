package com.royaraqamia.app.linksnap

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
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
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Icon
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
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.CornerRadius
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextDirection
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.store.linksnap.LinksnapRepository
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyShape
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlinx.coroutines.launch

/**
 * Opening a password-protected link (#654, #919), ported from
 * `frontend/ui/linksnap/unlock-link-form.tsx`.
 *
 * The code is a live read: the password is checked by the server and the
 * destination is the answer, never a queued write. Offline, the screen says it
 * needs a connection rather than guessing -- the one state the site's form also
 * names. The page is a single centred card, and every word on it comes from
 * [LinksnapUnlockCopy] so the two clients cannot spell a refusal differently.
 */
@Composable
fun LinksnapUnlockScreen(
    code: String,
    repository: LinksnapRepository,
    modifier: Modifier = Modifier,
    onOpenUrl: (String) -> Unit = {},
    onBack: () -> Unit = {},
) {
    LinksnapUnlockScreen(
        code = code,
        unlock = { password -> repository.unlock(code, password) },
        modifier = modifier,
        onOpenUrl = onOpenUrl,
        onBack = onBack,
    )
}

/**
 * The screen over the call it makes, so the visual gate can draw it without a
 * client (#874, ADR-0118): the test composes this and never presses the button.
 */
@Composable
internal fun LinksnapUnlockScreen(
    code: String,
    unlock: suspend (String) -> ApiResult<String>,
    modifier: Modifier = Modifier,
    onOpenUrl: (String) -> Unit = {},
    onBack: () -> Unit = {},
) {
    val scope = rememberCoroutineScope()
    var password by remember { mutableStateOf("") }
    var busy by remember { mutableStateOf(false) }
    var error by remember { mutableStateOf<String?>(null) }
    var needsConnection by remember { mutableStateOf(false) }

    val interaction = remember { MutableInteractionSource() }
    val focused by interaction.collectIsFocusedAsState()
    val focusRequester = remember { FocusRequester() }

    // The page autofocuses the field, so the card at rest carries the focused
    // field: the primary edge and its 2px ring. A native screen that opened
    // without it would be the same boxes and a different picture.
    LaunchedEffect(Unit) {
        runCatching { focusRequester.requestFocus() }
    }

    val state = LinksnapUnlockUiState.of(busy, error, needsConnection)

    fun submit() {
        if (busy) return
        if (password.isBlank()) {
            error = LinksnapUnlockCopy.EMPTY_PASSWORD
            needsConnection = false
            return
        }
        scope.launch {
            busy = true
            error = null
            needsConnection = false
            when (val answer = unlock(password)) {
                is ApiResult.Success -> onOpenUrl(answer.value)
                is ApiResult.Failure ->
                    when (val failure = answer.error) {
                        is ApiError.Network -> needsConnection = true
                        is ApiError.Server -> error = answerFor(failure.status)
                        ApiError.NotSignedIn -> error = LinksnapUnlockCopy.FALLBACK
                        is ApiError.InvalidContract -> error = LinksnapUnlockCopy.BAD_RESPONSE
                    }
            }
            busy = false
        }
    }

    Box(
        modifier = modifier.fillMaxSize().background(LinksnapUnlockMetrics.pageBackground),
        contentAlignment = Alignment.Center,
    ) {
        Column(
            modifier =
                Modifier.testTag(LinksnapUnlockMetrics.CARD)
                    .width(LinksnapUnlockMetrics.cardWidth)
                    .clip(RoundedCornerShape(LinksnapUnlockMetrics.cardRadius))
                    .background(LinksnapUnlockMetrics.cardBackground)
                    .border(
                        LinksnapUnlockMetrics.borderWidth,
                        LinksnapUnlockMetrics.cardBorder,
                        RoundedCornerShape(LinksnapUnlockMetrics.cardRadius),
                    )
                    .padding(
                        start = LinksnapUnlockMetrics.cardPaddingStart,
                        end = LinksnapUnlockMetrics.cardPaddingStart,
                        top = LinksnapUnlockMetrics.cardPaddingTop,
                        bottom = LinksnapUnlockMetrics.cardPaddingBottom,
                    ),
        ) {
            Box(
                modifier =
                    Modifier.align(Alignment.CenterHorizontally)
                        .size(LinksnapUnlockMetrics.iconSize)
                        .clip(RoundedCornerShape(LinksnapUnlockMetrics.iconRadius))
                        .background(RoyColors.primary.copy(alpha = 0.1f))
                        .border(
                            LinksnapUnlockMetrics.borderWidth,
                            RoyColors.primary.copy(alpha = 0.2f),
                            RoundedCornerShape(LinksnapUnlockMetrics.iconRadius),
                        ),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = LucideVectors.Lock,
                    contentDescription = null,
                    tint = RoyColors.primary,
                    modifier = Modifier.size(LinksnapUnlockMetrics.iconGlyph),
                )
            }

            Spacer(Modifier.height(LinksnapUnlockMetrics.iconToBadge))

            Row(
                modifier =
                    Modifier.testTag(LinksnapUnlockMetrics.BADGE)
                        .align(Alignment.CenterHorizontally)
                        .height(LinksnapUnlockMetrics.badgeHeight)
                        .clip(RoyShape.pill)
                        .background(RoyColors.primary.copy(alpha = 0.1f))
                        .border(
                            LinksnapUnlockMetrics.borderWidth,
                            RoyColors.primary.copy(alpha = 0.2f),
                            RoyShape.pill,
                        )
                        .padding(horizontal = LinksnapUnlockMetrics.badgePadding),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    Modifier.size(LinksnapUnlockMetrics.badgeDot)
                        .clip(CircleShape)
                        .background(RoyColors.primary)
                )
                Spacer(Modifier.width(LinksnapUnlockMetrics.badgeGap))
                Text(
                    text = LinksnapUnlockCopy.BADGE,
                    style =
                        TextStyle(
                            fontSize = LinksnapUnlockMetrics.badgeSize,
                            lineHeight = LinksnapUnlockMetrics.badgeLineHeight,
                            fontWeight = FontWeight.Medium,
                        ),
                    color = RoyColors.primary,
                )
            }

            Spacer(Modifier.height(LinksnapUnlockMetrics.badgeToTitle))

            Text(
                text = LinksnapUnlockCopy.TITLE,
                modifier =
                    Modifier.testTag(LinksnapUnlockMetrics.TITLE)
                        .fillMaxWidth()
                        .height(LinksnapUnlockMetrics.titleHeight),
                style =
                    TextStyle(
                        fontSize = LinksnapUnlockMetrics.titleSize,
                        lineHeight = LinksnapUnlockMetrics.titleLineHeight,
                        fontWeight = LinksnapUnlockMetrics.titleWeight,
                    ),
                color = LinksnapUnlockMetrics.titleColor,
                textAlign = TextAlign.Center,
            )

            Spacer(Modifier.height(LinksnapUnlockMetrics.titleToBody))

            Text(
                text = LinksnapUnlockCopy.BODY,
                modifier =
                    Modifier.testTag(LinksnapUnlockMetrics.BODY)
                        .fillMaxWidth()
                        .height(LinksnapUnlockMetrics.bodyHeight),
                style =
                    TextStyle(
                        fontSize = LinksnapUnlockMetrics.bodySize,
                        lineHeight = LinksnapUnlockMetrics.bodyLineHeight,
                    ),
                color = LinksnapUnlockMetrics.bodyColor,
                textAlign = TextAlign.Center,
                maxLines = 1,
                overflow = TextOverflow.Clip,
            )

            Spacer(Modifier.height(LinksnapUnlockMetrics.bodyToCode))

            Text(
                text = "/$code",
                modifier =
                    Modifier.testTag(LinksnapUnlockMetrics.CODE)
                        .fillMaxWidth()
                        .height(LinksnapUnlockMetrics.codeHeight),
                style =
                    TextStyle(
                        fontSize = LinksnapUnlockMetrics.codeSize,
                        lineHeight = LinksnapUnlockMetrics.codeLineHeight,
                        fontWeight = LinksnapUnlockMetrics.codeWeight,
                        fontFamily = FontFamily.Monospace,
                        textDirection = TextDirection.Ltr,
                    ),
                color = RoyColors.mutedForeground,
                textAlign = TextAlign.Center,
            )

            Spacer(Modifier.height(LinksnapUnlockMetrics.codeToForm))

            Box(
                modifier =
                    Modifier.testTag(LinksnapUnlockMetrics.INPUT)
                        .fillMaxWidth()
                        .height(LinksnapUnlockMetrics.inputHeight)
                        .clip(RoundedCornerShape(LinksnapUnlockMetrics.inputRadius))
                        .background(LinksnapUnlockMetrics.inputBackground)
                        .then(
                            if (focused) {
                                Modifier.drawBehind {
                                    val ring = LinksnapUnlockMetrics.focusRing.toPx()
                                    drawRoundRect(
                                        color = RoyColors.primary.copy(alpha = 0.2f),
                                        topLeft = Offset(-ring, -ring),
                                        size = Size(size.width + ring * 2, size.height + ring * 2),
                                        cornerRadius = CornerRadius(LinksnapUnlockMetrics.inputRadius.toPx() + ring),
                                        style = Stroke(width = ring),
                                    )
                                }
                            } else {
                                Modifier
                            }
                        )
                        .border(
                            LinksnapUnlockMetrics.borderWidth,
                            if (focused) RoyColors.primary else LinksnapUnlockMetrics.inputBorder,
                            RoundedCornerShape(LinksnapUnlockMetrics.inputRadius),
                        )
                        .padding(
                            start = LinksnapUnlockMetrics.inputPadding,
                            end = LinksnapUnlockMetrics.inputPadding,
                        ),
            ) {
                Row(
                    modifier = Modifier.fillMaxSize(),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = LucideVectors.Lock,
                        contentDescription = null,
                        tint = RoyColors.mutedForeground,
                        modifier = Modifier.size(LinksnapUnlockMetrics.inputIcon),
                    )
                    Spacer(Modifier.width(LinksnapUnlockMetrics.inputIconGap))
                    Box(Modifier.weight(1f)) {
                        if (password.isEmpty()) {
                            Text(
                                text = LinksnapUnlockCopy.PASSWORD_LABEL,
                                style =
                                    TextStyle(
                                        fontSize = LinksnapUnlockMetrics.inputTextSize,
                                        lineHeight = LinksnapUnlockMetrics.inputTextLineHeight,
                                    ),
                                color = LinksnapUnlockMetrics.placeholderColor,
                            )
                        }
                        BasicTextField(
                            value = password,
                            onValueChange = {
                                password = it
                                error = null
                                needsConnection = false
                            },
                            singleLine = true,
                            textStyle =
                                TextStyle(
                                    fontSize = LinksnapUnlockMetrics.inputTextSize,
                                    lineHeight = LinksnapUnlockMetrics.inputTextLineHeight,
                                    color = LinksnapUnlockMetrics.inputTextColor,
                                ),
                            cursorBrush = SolidColor(RoyColors.primary),
                            visualTransformation = PasswordVisualTransformation(),
                            keyboardOptions =
                                KeyboardOptions(imeAction = ImeAction.Done),
                            keyboardActions = KeyboardActions(onDone = { submit() }),
                            interactionSource = interaction,
                            modifier = Modifier.fillMaxWidth().focusRequester(focusRequester),
                        )
                    }
                }
            }

            if (state == LinksnapUnlockUiState.Error || state == LinksnapUnlockUiState.Offline) {
                Spacer(Modifier.height(LinksnapUnlockMetrics.formGap))
                Row(
                    modifier =
                        Modifier.fillMaxWidth()
                            .clip(RoundedCornerShape(LinksnapUnlockMetrics.inputRadius))
                            .background(RoyColors.destructive.copy(alpha = 0.1f))
                            .border(
                                LinksnapUnlockMetrics.borderWidth,
                                RoyColors.destructive.copy(alpha = 0.2f),
                                RoundedCornerShape(LinksnapUnlockMetrics.inputRadius),
                            )
                            .padding(LinksnapUnlockMetrics.badgePadding),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Icon(
                        imageVector = LucideVectors.CircleAlert,
                        contentDescription = null,
                        tint = RoyColors.destructive,
                        modifier = Modifier.size(LinksnapUnlockMetrics.inputIcon),
                    )
                    Spacer(Modifier.width(LinksnapUnlockMetrics.badgeGap))
                    Text(
                        text =
                            when (state) {
                                LinksnapUnlockUiState.Offline -> LinksnapUnlockCopy.OFFLINE
                                else -> error ?: LinksnapUnlockCopy.FALLBACK
                            },
                        style =
                            TextStyle(
                                fontSize = LinksnapUnlockMetrics.hintSize,
                                lineHeight = LinksnapUnlockMetrics.hintLineHeight,
                            ),
                        color = RoyColors.destructive,
                    )
                }
            }

            Spacer(Modifier.height(LinksnapUnlockMetrics.formGap))

            Box(
                modifier =
                    Modifier.testTag(LinksnapUnlockMetrics.SUBMIT)
                        .fillMaxWidth()
                        .height(LinksnapUnlockMetrics.buttonHeight)
                        .clip(RoyShape.pill)
                        .background(
                            Brush.horizontalGradient(colorStops = LinksnapUnlockMetrics.buttonStops)
                        )
                        .border(
                            LinksnapUnlockMetrics.borderWidth,
                            LinksnapUnlockMetrics.buttonBorder,
                            RoyShape.pill,
                        )
                        .clickable(enabled = !busy) { submit() },
                contentAlignment = Alignment.Center,
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(LinksnapUnlockMetrics.badgeGap),
                ) {
                    if (busy) {
                        Icon(
                            imageVector = LucideVectors.LoaderCircle,
                            contentDescription = null,
                            tint = Color.White,
                            modifier = Modifier.size(LinksnapUnlockMetrics.inputIcon),
                        )
                    }
                    Text(
                        text =
                            when (state) {
                                LinksnapUnlockUiState.Busy -> LinksnapUnlockCopy.BUSY
                                else -> LinksnapUnlockCopy.SUBMIT
                            },
                        style =
                            TextStyle(
                                fontSize = LinksnapUnlockMetrics.buttonTextSize,
                                lineHeight = LinksnapUnlockMetrics.buttonLineHeight,
                                fontWeight = LinksnapUnlockMetrics.buttonWeight,
                            ),
                        color = Color.White,
                    )
                }
            }

            Spacer(Modifier.height(LinksnapUnlockMetrics.submitToBack))

            Text(
                text = LinksnapUnlockCopy.BACK,
                modifier =
                    Modifier.testTag(LinksnapUnlockMetrics.BACK)
                        .fillMaxWidth()
                        .height(LinksnapUnlockMetrics.backHeight)
                        .clickable(onClick = onBack),
                style =
                    TextStyle(
                        fontSize = LinksnapUnlockMetrics.backSize,
                        lineHeight = LinksnapUnlockMetrics.backLineHeight,
                        fontWeight = LinksnapUnlockMetrics.backWeight,
                    ),
                color = LinksnapUnlockMetrics.backColor,
                textAlign = TextAlign.Center,
            )
        }
    }
}

/** The route's own words, from the status it answered with. */
private fun answerFor(status: Int): String =
    when (status) {
        400 -> LinksnapUnlockCopy.NOT_PROTECTED
        401 -> LinksnapUnlockCopy.WRONG_PASSWORD
        403 -> LinksnapUnlockCopy.BLOCKED
        404 -> LinksnapUnlockCopy.NOT_FOUND
        410 -> LinksnapUnlockCopy.EXPIRED
        else -> LinksnapUnlockCopy.FALLBACK
    }

/**
 * The page's numbers, measured from `e2e/__visual__/linksnap-unlock/at-rest/web.json`
 * at 393 CSS px (#919). The card is 361 wide with a 24 corner; its 24 padding and
 * 1 border put the content one pixel further in, which is why the layout padding
 * is 25 while the contract reports the stylesheet's 24.
 */
internal object LinksnapUnlockMetrics {
    const val CARD = "linksnap-unlock-card"
    const val BADGE = "linksnap-unlock-badge"
    const val TITLE = "linksnap-unlock-title"
    const val BODY = "linksnap-unlock-body"
    const val CODE = "linksnap-unlock-code"
    const val INPUT = "linksnap-unlock-input"
    const val SUBMIT = "linksnap-unlock-submit"
    const val BACK = "linksnap-unlock-back"

    val pageBackground = Color(0xFF020617)
    val cardBackground = Color(0xFF0C1426)
    val cardBorder = Color(0xFF182134)
    val titleColor = Color(0xFFFFFFFF)
    val bodyColor = Color(0xFF94A3B8)
    val backColor = Color(0xFF475569)
    val inputBackground = Color(0xFF0F172A)
    val inputBorder = Color(0xFF334155)
    val inputTextColor = Color(0xFFF1F5F9)
    val placeholderColor = Color(0xFF94A3B8)

    val borderWidth = 1.dp
    val focusRing = 2.dp

    val cardWidth = 361.dp
    val cardRadius = 24.dp
    val cardPadding = 24.dp
    val cardInset = 25.dp
    val cardPaddingStart = cardInset
    val cardPaddingTop = cardInset
    val cardPaddingBottom = cardPadding

    val iconSize = 80.dp
    val iconGlyph = 40.dp
    val iconRadius = 16.dp
    val iconToBadge = 24.dp

    val badgeHeight = 26.dp
    val badgePadding = 12.dp
    val badgeDot = 6.dp
    val badgeGap = 8.dp
    val badgeSize = 12.sp
    val badgeLineHeight = 16.sp
    val badgeToTitle = 12.dp

    val titleHeight = 32.dp
    val titleSize = 24.sp
    val titleLineHeight = 32.sp
    val titleWeight = FontWeight.Bold
    val titleToBody = 12.dp

    val bodyHeight = 22.75.dp
    val bodySize = 14.sp
    val bodyLineHeight = 22.75.sp
    val bodyToCode = 8.dp

    val codeHeight = 16.dp
    val codeSize = 12.sp
    val codeLineHeight = 16.sp
    val codeWeight = FontWeight.Bold
    val codeToForm = 32.dp

    val inputHeight = 48.dp
    val inputRadius = 12.dp
    val inputPadding = 16.dp
    val inputIcon = 16.dp
    val inputIconGap = 12.dp
    val inputTextSize = 14.sp
    val inputTextLineHeight = 20.sp

    val formGap = 16.dp
    val hintSize = 12.sp
    val hintLineHeight = 16.sp

    val buttonHeight = 52.dp
    val buttonTextSize = 16.sp
    val buttonLineHeight = 24.sp
    val buttonWeight = FontWeight.Bold
    val buttonBorder = Color.White.copy(alpha = 0.2f)
    val buttonStops = LinksnapMetrics.buttonStops

    val submitToBack = 23.dp
    val backHeight = 18.dp
    val backSize = 12.sp
    val backLineHeight = 16.sp
    val backWeight = FontWeight.Medium
}
