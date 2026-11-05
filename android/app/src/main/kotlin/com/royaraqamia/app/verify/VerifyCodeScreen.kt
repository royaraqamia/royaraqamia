package com.royaraqamia.app.verify

import android.graphics.Bitmap
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
import androidx.compose.material3.HorizontalDivider
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.produceState
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.FilterQuality
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.VerifyResult
import com.royaraqamia.app.contracts.generated.VerifyResultCertificate
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyFonts
import com.royaraqamia.app.theme.RoyShape
import com.royaraqamia.app.ui.vectors.LucideVectors
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext

/**
 * A shared certificate, as the site's `/verify/<code>` draws it (#658).
 *
 * This is the page a printed certificate's QR points at, so it is the one screen a
 * stranger reaches with no account and no context: the certificate, its seal, and
 * nothing to sign in to. The site renders it from a server-side lookup; the app asks
 * the same anonymous route for the code the link carried, because a link can arrive
 * with no radio — and a screen that showed "not found" to that visitor would be
 * telling them their certificate is fake.
 *
 * The card is the page's own, not the `/verify` screen's: the site keeps two
 * certificate cards (`certificate-result-card.tsx` there,
 * `app/verify/[code]/verify-client.tsx` here with a seal and a different header),
 * and a port that delegated to one would draw a card neither page draws.
 *
 * The found face is measured against the page by `check:visual`
 * (`shared/visual/verify-code.json`, ADR-0118): every box the design decides is
 * read from [VerifyCodeMetrics], which the screen and its visual test share.
 */
@Composable
fun VerifyCodeScreen(
    code: String,
    repository: VerifyRepository,
    siteUrl: String,
    onCopy: (String) -> Unit,
    onOpenRoute: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    VerifyCodeScreen(
        code = code,
        verify = repository::verify,
        siteUrl = siteUrl,
        onCopy = onCopy,
        onOpenRoute = onOpenRoute,
        modifier = modifier,
    )
}

/** The screen over the one call it makes, so a test can draw it without a client. */
@Composable
internal fun VerifyCodeScreen(
    code: String,
    verify: suspend (String) -> ApiResult<VerifyResult>,
    siteUrl: String,
    onCopy: (String) -> Unit,
    onOpenRoute: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current

    var state by remember(code) { mutableStateOf<VerifyCodeUiState?>(null) }
    var attempts by remember(code) { mutableStateOf(0) }
    var copied by remember(code) { mutableStateOf(false) }

    LaunchedEffect(code, attempts) {
        state = null
        state = VerifyCodeUiState.of(code, verify(code))
    }

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
                .padding(horizontal = VerifyCodeMetrics.horizontalPadding),
    ) {
        when (val shown = state) {
            null -> Skeleton()
            is VerifyCodeUiState.Found ->
                Found(
                    certificate = shown.certificate,
                    siteUrl = siteUrl,
                    copied = copied,
                    onCopyLink = {
                        onCopy(VerifyQrCode.urlFor(siteUrl, shown.certificate.certificate_code))
                        copied = true
                    },
                    onVerifyAnother = { onOpenRoute("/verify") },
                    onHome = { onOpenRoute("/") },
                )
            is VerifyCodeUiState.NotFound ->
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(spacing.elementGap),
                ) {
                    NotFound(
                        code = shown.code,
                        onRetry = { attempts += 1 },
                        onVerifyAnother = { onOpenRoute("/verify") },
                        onHome = { onOpenRoute("/") },
                    )
                }
            VerifyCodeUiState.Unreachable ->
                Column(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalAlignment = Alignment.CenterHorizontally,
                    verticalArrangement = Arrangement.spacedBy(spacing.elementGap),
                ) {
                    Unreachable(onRetry = { attempts += 1 })
                }
        }
    }
}

/** The page's header, its certificate card with the seal, and the three actions. */
@Composable
private fun Found(
    certificate: VerifyResultCertificate,
    siteUrl: String,
    copied: Boolean,
    onCopyLink: () -> Unit,
    onVerifyAnother: () -> Unit,
    onHome: () -> Unit,
) {
    val expired = CertificateResultState.of(certificate.expiration_date) == CertificateResultState.Expired

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Box(
            modifier =
                Modifier.size(VerifyCodeMetrics.heroGlyphBox)
                    .clip(RoundedCornerShape(VerifyCodeMetrics.heroGlyphRadius))
                    .background(
                        Brush.linearGradient(
                            listOf(RoyColors.primary, RoyColors.accentPurple)
                        )
                    ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = LucideVectors.ShieldCheck,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(VerifyCodeMetrics.heroGlyph),
            )
        }

        Spacer(Modifier.height(VerifyCodeMetrics.heroToTitle))

        Text(
            text = "${VerifyCodeCopy.VERIFIED_LEAD} ${VerifyCodeCopy.VERIFIED_ACCENT}",
            modifier =
                Modifier.fillMaxWidth()
                    .height(VerifyCodeMetrics.titleHeight)
                    .testTag(VerifyCodeMetrics.TITLE),
            style =
                TextStyle(
                    fontFamily = RoyFonts.ui,
                    fontSize = VerifyCodeMetrics.titleSize,
                    lineHeight = VerifyCodeMetrics.titleLineHeight,
                    fontWeight = VerifyCodeMetrics.titleWeight,
                    textAlign = TextAlign.Center,
                ),
            color = RoyColors.foreground,
        )

        Spacer(Modifier.height(VerifyCodeMetrics.titleToSubtitle))

        Text(
            text = VerifyCodeCopy.VERIFIED_BODY,
            modifier =
                Modifier.fillMaxWidth()
                    .height(VerifyCodeMetrics.subtitleHeight)
                    .testTag(VerifyCodeMetrics.SUBTITLE),
            style =
                TextStyle(
                    fontFamily = RoyFonts.ui,
                    fontSize = VerifyCodeMetrics.subtitleSize,
                    lineHeight = VerifyCodeMetrics.subtitleLineHeight,
                    textAlign = TextAlign.Center,
                ),
            color = RoyColors.mutedForeground,
        )

        Spacer(Modifier.height(VerifyCodeMetrics.subtitleToCard))

        CertificateCard(
            certificate = certificate,
            siteUrl = siteUrl,
            expired = expired,
        )

        Spacer(Modifier.height(VerifyCodeMetrics.cardToActions))

        Actions(
            copied = copied,
            onVerifyAnother = onVerifyAnother,
            onCopyLink = onCopyLink,
            onHome = onHome,
        )

        // The page keeps a live region for the copy, so a screen reader announces
        // it. It sits outside the action dock: the page's is `sr-only`, and a
        // visible sentence here would make the dock taller than the page's.
        Text(
            text = if (copied) VerifyCodeCopy.COPIED_STATUS else "",
            style = LocalRoyTypeScale.current.xs,
            color = RoyColors.success,
        )
    }
}

/**
 * The page's card: the banner with the shield and the validity badge, the six
 * detail rows, and the seal.
 *
 * The border is part of the card's box on the page (`box-sizing: border-box`), so
 * Compose paints it inside the bounds without consuming space: the same 1dp is
 * added as padding for the boxes to line up (the rule [VerifyScreen] follows too).
 */
@Composable
private fun CertificateCard(
    certificate: VerifyResultCertificate,
    siteUrl: String,
    expired: Boolean,
) {
    Column(
        modifier =
            Modifier.fillMaxWidth()
                .testTag(VerifyCodeMetrics.CARD)
                .clip(RoundedCornerShape(VerifyCodeMetrics.cardRadius))
                .background(RoyColors.card.copy(alpha = 0.8f))
                .border(
                    VerifyCodeMetrics.border,
                    RoyColors.border.copy(alpha = 0.8f),
                    RoundedCornerShape(VerifyCodeMetrics.cardRadius),
                )
                .padding(VerifyCodeMetrics.border),
    ) {
        CardBanner(expired)
        Column(
            modifier =
                Modifier.fillMaxWidth()
                    .padding(
                        start = VerifyCodeMetrics.cardPaddingHorizontal,
                        top = VerifyCodeMetrics.cardPaddingTop,
                        end = VerifyCodeMetrics.cardPaddingHorizontal,
                        bottom = VerifyCodeMetrics.cardPaddingBottom,
                    ),
        ) {
            Details(certificate = certificate, expired = expired)
            Spacer(Modifier.height(VerifyCodeMetrics.detailsToSeal))
            Seal(code = certificate.certificate_code, siteUrl = siteUrl)
        }
    }
}

/** The card's own header: the shield, the two sentences and the validity badge. */
@Composable
private fun CardBanner(expired: Boolean) {
    val tint = if (expired) RoyColors.destructive else RoyColors.primary

    Column(
        modifier =
            Modifier.fillMaxWidth()
                .height(VerifyCodeMetrics.cardHeaderHeight)
                .testTag(VerifyCodeMetrics.CARD_HEADER),
    ) {
        Row(
            modifier =
                Modifier.fillMaxWidth()
                    .height(VerifyCodeMetrics.cardHeaderContentHeight)
                    .background(
                        Brush.horizontalGradient(
                            listOf(
                                tint.copy(alpha = 0.05f),
                                tint.copy(alpha = 0.1f),
                                Color.Transparent,
                            )
                        )
                    )
                    .padding(
                        horizontal = VerifyCodeMetrics.cardHeaderPaddingHorizontal,
                        vertical = VerifyCodeMetrics.cardHeaderPaddingVertical,
                    ),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(VerifyCodeMetrics.cardHeaderGap),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Box(
                    modifier =
                        Modifier.size(VerifyCodeMetrics.cardHeaderIcon)
                            .clip(RoundedCornerShape(VerifyCodeMetrics.cardHeaderIconRadius))
                            .background(
                                Brush.linearGradient(
                                    listOf(RoyColors.primary, RoyColors.accentPurple)
                                )
                            ),
                    contentAlignment = Alignment.Center,
                ) {
                    Icon(
                        imageVector = LucideVectors.ShieldCheck,
                        contentDescription = null,
                        tint = Color.White,
                        modifier = Modifier.size(VerifyCodeMetrics.cardHeaderGlyph),
                    )
                }
                Column(
                    verticalArrangement =
                        Arrangement.spacedBy(VerifyCodeMetrics.cardHeaderTextGap),
                ) {
                    Text(
                        text = VerifyCodeCopy.VERIFIED_CARD_TITLE,
                        style =
                            TextStyle(
                                fontFamily = RoyFonts.ui,
                                fontSize = VerifyCodeMetrics.cardHeaderTitleSize,
                                lineHeight = VerifyCodeMetrics.cardHeaderTitleLine,
                                fontWeight = FontWeight.Bold,
                            ),
                        color = RoyColors.foreground,
                    )
                    Text(
                        text = VerifyCodeCopy.VERIFIED_CARD_SUBTITLE,
                        style =
                            TextStyle(
                                fontFamily = RoyFonts.ui,
                                fontSize = VerifyCodeMetrics.cardHeaderSubtitleSize,
                                lineHeight = VerifyCodeMetrics.cardHeaderSubtitleLine,
                            ),
                        color = RoyColors.mutedForeground,
                    )
                }
            }
            ValidityMark(expired)
        }
        HorizontalDivider(
            thickness = VerifyCodeMetrics.border,
            color = RoyColors.border.copy(alpha = 0.6f),
        )
    }
}

/** The page's badge: the dot and the sentence that qualifies the certificate. */
@Composable
private fun ValidityMark(expired: Boolean) {
    // The page's valid badge is the success tone; its dot stays the primary accent.
    val tint = if (expired) RoyColors.destructive else RoyColors.success
    val dotTint = if (expired) RoyColors.destructive else RoyColors.primary

    Surface(
        shape = RoundedCornerShape(VerifyCodeMetrics.badgeRadius),
        color = tint.copy(alpha = 0.15f),
        border = BorderStroke(VerifyCodeMetrics.border, tint.copy(alpha = 0.3f)),
    ) {
        Row(
            modifier =
                Modifier.padding(
                    horizontal = VerifyCodeMetrics.badgePaddingHorizontal,
                    vertical = VerifyCodeMetrics.badgePaddingVertical,
                ),
            horizontalArrangement = Arrangement.spacedBy(VerifyCodeMetrics.badgeGap),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier =
                    Modifier.size(VerifyCodeMetrics.badgeDot)
                        .clip(RoundedCornerShape(percent = 50))
                        .background(dotTint)
            )
            Text(
                text =
                    if (expired) VerifyCodeCopy.EXPIRED_BADGE else VerifyCodeCopy.VALID_BADGE,
                style =
                    TextStyle(
                        fontFamily = RoyFonts.ui,
                        fontSize = VerifyCodeMetrics.badgeTextSize,
                        lineHeight = VerifyCodeMetrics.badgeTextLine,
                        fontWeight = FontWeight.Bold,
                    ),
                color = tint,
            )
        }
    }
}

/** The six label/value cards the page stacks under the banner. */
@Composable
private fun Details(certificate: VerifyResultCertificate, expired: Boolean) {
    val details =
        listOf(
            Detail(
                glyph = LucideVectors.Hash,
                label = VerifyCodeCopy.CODE_LABEL,
                value = certificate.certificate_code,
                accent = true,
                mono = true,
            ),
            Detail(
                glyph = LucideVectors.User,
                label = VerifyCodeCopy.STUDENT_LABEL,
                value = certificate.student_name,
            ),
            Detail(
                glyph = LucideVectors.GraduationCap,
                label = VerifyCodeCopy.COURSE_LABEL,
                value = certificate.course_name,
            ),
            Detail(
                glyph = LucideVectors.CalendarDays,
                label = VerifyCodeCopy.ISSUED_LABEL,
                value = CertificateDates.label(certificate.issue_date),
            ),
        ) +
            listOfNotNull(
                certificate.expiration_date?.let {
                    Detail(
                        glyph = LucideVectors.Clock,
                        label = VerifyCodeCopy.EXPIRES_LABEL,
                        value = CertificateDates.label(it),
                        danger = expired,
                    )
                },
                certificate.grade_or_status?.let {
                    Detail(
                        glyph = LucideVectors.Trophy,
                        label = VerifyCodeCopy.GRADE_LABEL,
                        value = it,
                    )
                },
            )

    Column(
        modifier = Modifier.fillMaxWidth().testTag(VerifyCodeMetrics.DETAILS),
        verticalArrangement = Arrangement.spacedBy(VerifyCodeMetrics.detailGap),
    ) {
        details.forEachIndexed { index, detail ->
            DetailRow(index = index, detail = detail)
        }
    }
}

private data class Detail(
    val glyph: ImageVector,
    val label: String,
    val value: String,
    val accent: Boolean = false,
    val danger: Boolean = false,
    val mono: Boolean = false,
)

/** One detail: the site's glyph, label and value, in its own card. */
@Composable
private fun DetailRow(index: Int, detail: Detail) {
    val valueColor =
        when {
            detail.danger -> RoyColors.destructive
            detail.accent -> RoyColors.primary
            else -> RoyColors.foreground
        }

    Row(
        modifier =
            Modifier.fillMaxWidth()
                .height(VerifyCodeMetrics.detailHeight)
                .testTag(VerifyCodeMetrics.detailTag(index))
                .clip(RoundedCornerShape(VerifyCodeMetrics.detailRadius))
                .background(RoyColors.card.copy(alpha = 0.4f))
                .border(
                    VerifyCodeMetrics.border,
                    RoyColors.border.copy(alpha = 0.5f),
                    RoundedCornerShape(VerifyCodeMetrics.detailRadius),
                )
                .padding(VerifyCodeMetrics.border)
                .padding(VerifyCodeMetrics.detailPadding),
        horizontalArrangement = Arrangement.spacedBy(VerifyCodeMetrics.detailIconGap),
        verticalAlignment = Alignment.Top,
    ) {
        Box(
            modifier =
                Modifier.padding(top = VerifyCodeMetrics.detailIconTop)
                    .size(VerifyCodeMetrics.detailIcon)
                    .clip(RoundedCornerShape(VerifyCodeMetrics.detailIconRadius))
                    .background(RoyColors.background)
                    .border(
                        VerifyCodeMetrics.border,
                        RoyColors.border.copy(alpha = 0.6f),
                        RoundedCornerShape(VerifyCodeMetrics.detailIconRadius),
                    ),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = detail.glyph,
                contentDescription = null,
                tint = RoyColors.mutedForeground,
                modifier = Modifier.size(VerifyCodeMetrics.detailGlyph),
            )
        }
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(VerifyCodeMetrics.detailLabelToValue),
        ) {
            Text(
                text = detail.label,
                style =
                    TextStyle(
                        fontFamily = RoyFonts.ui,
                        fontSize = VerifyCodeMetrics.detailLabelSize,
                        lineHeight = VerifyCodeMetrics.detailLabelLine,
                    ),
                color = RoyColors.mutedForeground,
            )
            Text(
                text = detail.value,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                style =
                    TextStyle(
                        fontFamily =
                            if (detail.mono) FontFamily.Monospace
                            else RoyFonts.ui,
                        fontSize = VerifyCodeMetrics.detailValueSize,
                        lineHeight = VerifyCodeMetrics.detailValueLine,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = if (detail.mono) 0.05.em else TextStyle.Default.letterSpacing,
                        textAlign = if (detail.mono) TextAlign.End else TextAlign.Start,
                    ),
                color = valueColor,
            )
        }
    }
}

/**
 * The site's seal: the certificate's own link as a QR, with the sentence that says
 * what to do with it.
 *
 * The image is encoded off the main thread and the box keeps its size while it is
 * not there yet, so a slow first frame cannot make the card jump. The modules are
 * white on the page's dark frame (the site's QR paints white on transparent over a
 * dark card), so the app draws the same polarity rather than the usual dark-on-white.
 */
@Composable
private fun Seal(code: String, siteUrl: String) {
    val type = LocalRoyTypeScale.current
    val url = remember(code, siteUrl) { VerifyQrCode.urlFor(siteUrl, code) }

    Column(
        modifier =
            Modifier.fillMaxWidth()
                .height(VerifyCodeMetrics.sealHeight)
                .testTag(VerifyCodeMetrics.SEAL)
                .clip(RoundedCornerShape(VerifyCodeMetrics.sealRadius))
                .background(
                    Brush.verticalGradient(
                        listOf(
                            RoyColors.card.copy(alpha = 0.5f),
                            RoyColors.background.copy(alpha = 0.5f),
                        )
                    )
                )
                .border(
                    VerifyCodeMetrics.border,
                    RoyColors.border.copy(alpha = 0.8f),
                    RoundedCornerShape(VerifyCodeMetrics.sealRadius),
                )
                .padding(VerifyCodeMetrics.border)
                .padding(VerifyCodeMetrics.sealPadding),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(VerifyCodeMetrics.sealGap),
    ) {
        QrSeal(url = url)
        Row(
            modifier =
                Modifier.height(VerifyCodeMetrics.scanHeight)
                    .clip(RoundedCornerShape(VerifyCodeMetrics.scanRadius))
                    .padding(
                        horizontal = VerifyCodeMetrics.scanPaddingHorizontal,
                        vertical = VerifyCodeMetrics.scanPaddingVertical,
                    ),
            horizontalArrangement = Arrangement.spacedBy(VerifyCodeMetrics.scanGap),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = LucideVectors.ScanBarcode,
                contentDescription = null,
                tint = RoyColors.mutedForeground,
                modifier = Modifier.size(VerifyCodeMetrics.scanIcon),
            )
            Text(
                text = VerifyCodeCopy.SCAN_HINT,
                style =
                    TextStyle(
                        fontFamily = RoyFonts.ui,
                        fontSize = type.xs.fontSize,
                        lineHeight = VerifyCodeMetrics.scanTextLine,
                    ),
                color = RoyColors.mutedForeground,
            )
        }
    }
}

/** The dark frame and the white modules, at the page's own sizes. */
@Composable
private fun QrSeal(url: String) {
    val image by produceState<ImageBitmap?>(initialValue = null, url) {
        value =
            withContext(Dispatchers.Default) {
                VerifyQrCode.matrix(url)?.let { matrix ->
                    val width = matrix.width
                    val pixels =
                        IntArray(width * width) { index ->
                            if (matrix.get(index % width, index / width)) OPAQUE_INK
                            else Color.Transparent.toArgb()
                        }
                    Bitmap.createBitmap(pixels, width, width, Bitmap.Config.ARGB_8888).asImageBitmap()
                }
            }
    }

    Box(
        modifier =
            Modifier.size(VerifyCodeMetrics.qrBox)
                .clip(RoundedCornerShape(VerifyCodeMetrics.qrBoxRadius))
                .background(VerifyCodeMetrics.qrSurface)
                .border(
                    VerifyCodeMetrics.border,
                    Color.White.copy(alpha = 0.1f),
                    RoundedCornerShape(VerifyCodeMetrics.qrBoxRadius),
                ),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier =
                Modifier.size(VerifyCodeMetrics.qrRoot)
                    .clip(RoundedCornerShape(VerifyCodeMetrics.qrRootRadius))
                    .background(VerifyCodeMetrics.qrRootSurface)
                    .border(
                        VerifyCodeMetrics.border,
                        Color.White.copy(alpha = 0.1f),
                        RoundedCornerShape(VerifyCodeMetrics.qrRootRadius),
                    ),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier =
                    Modifier.size(VerifyCodeMetrics.qrFrame)
                        .clip(RoundedCornerShape(VerifyCodeMetrics.qrFrameRadius))
                        .background(VerifyCodeMetrics.qrFrameSurface)
                        .border(
                            VerifyCodeMetrics.border,
                            Color.White.copy(alpha = 0.1f),
                            RoundedCornerShape(VerifyCodeMetrics.qrFrameRadius),
                        )
                        .padding(VerifyCodeMetrics.qrFramePadding),
                contentAlignment = Alignment.Center,
            ) {
                val drawn = image
                if (drawn != null) {
                    Image(
                        bitmap = drawn,
                        contentDescription = url,
                        contentScale = ContentScale.Fit,
                        filterQuality = FilterQuality.None,
                        modifier = Modifier.size(VerifyCodeMetrics.qrImage),
                    )
                }
            }
        }
    }
}

/** The page's three actions, one per row at this width. */
@Composable
private fun Actions(
    copied: Boolean,
    onVerifyAnother: () -> Unit,
    onCopyLink: () -> Unit,
    onHome: () -> Unit,
) {
    val spacing = LocalRoySpacing.current

    Column(
        modifier = Modifier.fillMaxWidth().testTag(VerifyCodeMetrics.ACTIONS),
        verticalArrangement = Arrangement.spacedBy(VerifyCodeMetrics.actionGap),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Button(
            onClick = onVerifyAnother,
            modifier = Modifier.height(VerifyCodeMetrics.actionHeight),
            shape = RoundedCornerShape(percent = 50),
        ) {
            Icon(
                imageVector = LucideVectors.Search,
                contentDescription = null,
                modifier = Modifier.size(Recipes.Glyph.sm),
            )
            Text(
                text = VerifyCodeCopy.VERIFY_ANOTHER,
                modifier = Modifier.padding(start = spacing.elementGapSm / 2f),
            )
        }

        OutlinedButton(
            onClick = onCopyLink,
            modifier = Modifier.height(VerifyCodeMetrics.actionHeight),
            shape = RoundedCornerShape(percent = 50),
        ) {
            Icon(
                imageVector = if (copied) LucideVectors.Check else LucideVectors.Copy,
                contentDescription = null,
                modifier = Modifier.size(Recipes.Glyph.sm),
            )
            Text(
                text = if (copied) VerifyCodeCopy.COPIED else VerifyCodeCopy.COPY_LINK,
                modifier = Modifier.padding(start = spacing.elementGapSm / 2f),
            )
        }

        OutlinedButton(
            onClick = onHome,
            modifier = Modifier.height(VerifyCodeMetrics.actionHeight),
            shape = RoundedCornerShape(percent = 50),
        ) {
            Icon(
                imageVector = LucideVectors.ExternalLink,
                contentDescription = null,
                modifier = Modifier.size(Recipes.Glyph.sm),
            )
            Text(
                text = VerifyCodeCopy.SITE_NAME,
                modifier = Modifier.padding(start = spacing.elementGapSm / 2f),
            )
        }
    }
}

/** The site's "no such certificate" page: the code, why, and the two ways on. */
@Composable
private fun NotFound(
    code: String,
    onRetry: () -> Unit,
    onVerifyAnother: () -> Unit,
    onHome: () -> Unit,
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Box(
        modifier =
            Modifier.size(Recipes.Glyph.md * 2.5f)
                .clip(RoyShape.card)
                .background(RoyColors.destructive.copy(alpha = 0.15f)),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = LucideVectors.ShieldAlert,
            contentDescription = null,
            tint = RoyColors.destructive,
            modifier = Modifier.size(Recipes.Glyph.md * 1.5f),
        )
    }
    WarningBadge(VerifyCodeCopy.NOT_FOUND_BADGE)

    Text(
        text = VerifyCodeCopy.NOT_FOUND_HEADING,
        style = type.h2.copy(fontWeight = FontWeight.Bold),
        color = MaterialTheme.colorScheme.onSurface,
        textAlign = TextAlign.Center,
    )
    Text(
        text = "${VerifyCodeCopy.NOT_FOUND_BODY} $code",
        style = type.small,
        color = Recipes.Row.labelColor,
        textAlign = TextAlign.Center,
    )

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoyShape.card,
        color = RoyColors.destructive.copy(alpha = 0.05f),
        border = BorderStroke(1.dp, RoyColors.destructive.copy(alpha = 0.15f)),
    ) {
        Column(
            modifier = Modifier.padding(spacing.elementGap),
            verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2f),
        ) {
            Text(
                text = VerifyCodeCopy.NOT_FOUND_REASON,
                style = type.small.copy(fontWeight = FontWeight.Bold),
                color = RoyColors.destructive,
            )
            Text(
                text = VerifyCodeCopy.NOT_FOUND_HINT,
                style = type.xs,
                color = Recipes.Row.labelColor,
            )
        }
    }

    // The site's two actions: try again (on the page that takes a code) and home.
    Button(onClick = onRetry, modifier = Modifier.fillMaxWidth()) {
        Icon(
            imageVector = LucideVectors.ArrowRight,
            contentDescription = null,
            modifier = Modifier.size(Recipes.Glyph.sm),
        )
        Text(
            text = VerifyCodeCopy.RETRY_ACTION,
            modifier = Modifier.padding(start = spacing.elementGapSm / 2f),
        )
    }
    OutlinedButton(onClick = onVerifyAnother, modifier = Modifier.fillMaxWidth()) {
        Text(text = VerifyCodeCopy.HOME_ACTION)
    }
    OutlinedButton(onClick = onHome, modifier = Modifier.fillMaxWidth()) {
        Icon(
            imageVector = LucideVectors.ExternalLink,
            contentDescription = null,
            modifier = Modifier.size(Recipes.Glyph.sm),
        )
        Text(
            text = VerifyCodeCopy.SITE_NAME,
            modifier = Modifier.padding(start = spacing.elementGapSm / 2f),
        )
    }
}

/**
 * The face the site cannot have: the check never ran.
 *
 * It borrows the `/verify` page's own sentences (`VerifyCopy`) rather than inventing
 * a second wording for the same fact — a request that never left is the same event
 * on both screens of this app.
 */
@Composable
private fun Unreachable(onRetry: () -> Unit) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    WarningBadge(VerifyCopy.UNREACHABLE_BADGE)

    Text(
        text = VerifyCopy.UNREACHABLE_TITLE,
        style = type.h2.copy(fontWeight = FontWeight.Bold),
        color = MaterialTheme.colorScheme.onSurface,
        textAlign = TextAlign.Center,
    )
    Text(
        text = VerifyCopy.UNREACHABLE_BODY,
        style = type.small,
        color = Recipes.Row.labelColor,
        textAlign = TextAlign.Center,
    )
    OutlinedButton(onClick = onRetry, modifier = Modifier.fillMaxWidth()) {
        Text(text = VerifyCodeCopy.RETRY_ACTION)
    }
}

@Composable
private fun WarningBadge(label: String) {
    val type = LocalRoyTypeScale.current
    val size = Recipes.Badge.default(type)

    Surface(
        shape = Recipes.Badge.radius,
        color = RoyColors.destructive.copy(alpha = 0.15f),
        border = BorderStroke(Recipes.Badge.borderWidth, RoyColors.destructive.copy(alpha = 0.3f)),
    ) {
        Row(
            modifier = Modifier.padding(horizontal = size.paddingX, vertical = size.paddingY),
            horizontalArrangement = Arrangement.spacedBy(size.gap),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = LucideVectors.CircleAlert,
                contentDescription = null,
                tint = RoyColors.destructive,
                modifier = Modifier.size(Recipes.Glyph.sm - 2f.dp),
            )
            Text(text = label, style = size.text, color = RoyColors.destructive)
        }
    }
}

/** The recipe's blocks, for the moment the check is out. */
@Composable
private fun Skeleton() {
    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(Recipes.Skeleton.gap),
    ) {
        for (height in Recipes.Skeleton.blocks) {
            Box(
                modifier =
                    Modifier.fillMaxWidth()
                        .size(height)
                        .background(Recipes.Skeleton.fill.copy(alpha = 0.5f), Recipes.Skeleton.radius),
            )
        }
    }
}

/**
 * The page's numbers at 393 x 852, as one source the screen and its test share
 * (#896, ADR-0118).
 *
 * They are what `app/verify/[code]/verify-client.tsx` resolves to at that width:
 * the header's 80 glyph, the 30/36 title, the 24 card radius and its 24 header
 * padding, the 68 detail rows at a 14 gap, the 244 seal and the 56 buttons. Keeping
 * them here rather than inline is what lets the test measure the numbers the screen
 * draws, so a change to one without the other fails `check:visual` instead of
 * drifting quietly.
 */
internal object VerifyCodeMetrics {
    const val TITLE = "verify-code-title"
    const val SUBTITLE = "verify-code-subtitle"
    const val CARD = "verify-code-card"
    const val CARD_HEADER = "verify-code-card-header"
    const val DETAILS = "verify-code-details"
    const val SEAL = "verify-code-seal"
    const val ACTIONS = "verify-code-actions"

    fun detailTag(index: Int): String = "verify-code-detail-$index"

    val horizontalPadding = 16.dp

    val heroGlyphBox = 80.dp
    val heroGlyphRadius = 24.dp
    val heroGlyph = 40.dp
    val heroToTitle = 24.dp

    val titleSize = 30.sp
    val titleLineHeight = 36.sp
    val titleHeight = 36.dp
    val titleWeight = FontWeight.ExtraBold
    val titleToSubtitle = 12.dp

    val subtitleSize = 16.sp
    val subtitleLineHeight = 26.sp
    val subtitleHeight = 26.dp
    val subtitleToCard = 40.dp

    val border = 1.dp
    val cardRadius = 24.dp
    val cardHeaderHeight = 85.dp
    val cardHeaderContentHeight = 84.dp
    val cardHeaderPaddingHorizontal = 24.dp
    val cardHeaderPaddingVertical = 20.dp
    val cardHeaderIcon = 44.dp
    val cardHeaderIconRadius = 16.dp
    val cardHeaderGlyph = 24.dp
    val cardHeaderGap = 14.dp
    val cardHeaderTextGap = 0.dp
    val cardHeaderTitleSize = 16.sp
    val cardHeaderTitleLine = 24.sp
    val cardHeaderSubtitleSize = 12.sp
    val cardHeaderSubtitleLine = 16.sp
    val cardPaddingHorizontal = 24.dp
    val cardPaddingTop = 24.dp
    val cardPaddingBottom = 20.dp

    val badgeRadius = 12.dp
    val badgePaddingHorizontal = 14.dp
    val badgePaddingVertical = 4.dp
    val badgeGap = 8.dp
    val badgeDot = 8.dp
    val badgeTextSize = 12.sp
    val badgeTextLine = 16.sp

    val detailHeight = 68.dp
    val detailRadius = 16.dp
    val detailPadding = 14.dp
    val detailGap = 14.dp
    val detailIconGap = 14.dp
    val detailIconTop = 2.dp
    val detailIcon = 36.dp
    val detailIconRadius = 12.dp
    val detailGlyph = 16.dp
    val detailLabelSize = 12.sp
    val detailLabelLine = 16.sp
    val detailLabelToValue = 2.dp
    val detailValueSize = 14.sp
    val detailValueLine = 20.sp

    // 30.8, not the page's 32: dp-to-pixel rounding makes each of the five 14dp
    // detail gaps 14.18, so the column is 0.9 taller than the page's. This takes
    // that back out at the seam the contract cannot see between two boxes, which
    // keeps the card, the seal and the actions on the page's own rows.
    val detailsToSeal = 30.8.dp
    val sealHeight = 334.dp
    val sealRadius = 16.dp
    val sealPadding = 24.dp
    val sealGap = 16.dp

    val qrBox = 244.dp
    val qrBoxRadius = 16.dp
    val qrRoot = 218.dp
    val qrRootRadius = 24.dp
    val qrFrame = 176.dp
    val qrFrameRadius = 16.dp
    val qrFramePadding = 12.dp
    val qrImage = 144.dp
    val qrSurface = Color(0xFF171717)
    val qrRootSurface = Color(0xFF0A0A0A).copy(alpha = 0.9f)
    val qrFrameSurface = Color(0xFF171717).copy(alpha = 0.9f)

    val scanHeight = 24.dp
    val scanRadius = 8.dp
    val scanPaddingHorizontal = 8.dp
    val scanPaddingVertical = 4.dp
    val scanGap = 6.dp
    val scanIcon = 14.dp
    val scanTextLine = 16.sp

    val cardToActions = 32.dp
    val actionHeight = 56.dp
    val actionGap = 12.dp
}

private const val COPIED_MARK_MS = 2_000L
private const val OPAQUE_INK = 0xFFFFFFFF.toInt()
