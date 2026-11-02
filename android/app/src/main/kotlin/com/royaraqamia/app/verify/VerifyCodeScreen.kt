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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Button
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.ImageBitmap
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.contracts.generated.VerifyResultCertificate
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
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
    val spacing = LocalRoySpacing.current

    var state by remember(code) { mutableStateOf<VerifyCodeUiState?>(null) }
    var attempts by remember(code) { mutableStateOf(0) }
    var copied by remember(code) { mutableStateOf(false) }

    LaunchedEffect(code, attempts) {
        state = null
        state = VerifyCodeUiState.of(code, repository.verify(code))
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
                .verticalScroll(rememberScrollState())
                .padding(horizontal = spacing.elementGap, vertical = spacing.elementGapSm),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGap),
        horizontalAlignment = Alignment.CenterHorizontally,
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
                NotFound(
                    code = shown.code,
                    onRetry = { attempts += 1 },
                    onVerifyAnother = { onOpenRoute("/verify") },
                    onHome = { onOpenRoute("/") },
                )
            VerifyCodeUiState.Unreachable -> Unreachable(onRetry = { attempts += 1 })
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
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current
    val expired = CertificateResultState.of(certificate.expiration_date) == CertificateResultState.Expired

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        Box(
            modifier =
                Modifier.size(Recipes.Glyph.md * 2.5f)
                    .clip(RoyShape.pill)
                    .background(RoyColors.primary.copy(alpha = 0.15f)),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = LucideVectors.ShieldCheck,
                contentDescription = null,
                tint = RoyColors.primary,
                modifier = Modifier.size(Recipes.Glyph.md * 1.5f),
            )
        }
        Text(
            text = "${VerifyCodeCopy.VERIFIED_LEAD} ${VerifyCodeCopy.VERIFIED_ACCENT}",
            style = type.h2.copy(fontWeight = FontWeight.Bold),
            color = MaterialTheme.colorScheme.onSurface,
            textAlign = TextAlign.Center,
        )
        Text(
            text = VerifyCodeCopy.VERIFIED_BODY,
            style = type.small,
            color = Recipes.Row.labelColor,
            textAlign = TextAlign.Center,
        )
    }

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoyShape.card,
        color = RoyColors.card.copy(alpha = 0.9f),
        border = BorderStroke(1.dp, RoyColors.primary.copy(alpha = 0.2f)),
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            CardBanner(expired)
            Column(
                modifier = Modifier.padding(Recipes.Card.padding(spacing)),
                verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
            ) {
                DetailRow(LucideVectors.Hash, VerifyCodeCopy.CODE_LABEL, certificate.certificate_code, accent = true)
                DetailRow(LucideVectors.User, VerifyCodeCopy.STUDENT_LABEL, certificate.student_name)
                DetailRow(LucideVectors.GraduationCap, VerifyCodeCopy.COURSE_LABEL, certificate.course_name)
                DetailRow(
                    LucideVectors.CalendarDays,
                    VerifyCodeCopy.ISSUED_LABEL,
                    CertificateDates.label(certificate.issue_date),
                )
                val expires = certificate.expiration_date
                if (expires != null) {
                    DetailRow(
                        LucideVectors.Clock,
                        VerifyCodeCopy.EXPIRES_LABEL,
                        CertificateDates.label(expires),
                        danger = expired,
                    )
                }
                val grade = certificate.grade_or_status
                if (grade != null) {
                    DetailRow(LucideVectors.Trophy, VerifyCodeCopy.GRADE_LABEL, grade)
                }

                Seal(code = certificate.certificate_code, siteUrl = siteUrl)
            }
        }
    }

    Button(onClick = onVerifyAnother, modifier = Modifier.fillMaxWidth()) {
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

    OutlinedButton(onClick = onCopyLink, modifier = Modifier.fillMaxWidth()) {
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

    // The page keeps a live region for the copy, so a screen reader announces it.
    Text(
        text = if (copied) VerifyCodeCopy.COPIED_STATUS else "",
        style = type.xs,
        color = RoyColors.success,
    )
}

/** The card's own header: the shield, the two sentences and the validity badge. */
@Composable
private fun CardBanner(expired: Boolean) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current
    val tint = if (expired) RoyColors.destructive else RoyColors.primary

    Row(
        modifier =
            Modifier.fillMaxWidth()
                .background(tint.copy(alpha = 0.08f))
                .padding(horizontal = Recipes.Card.padding(spacing), vertical = spacing.elementGap),
        horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = LucideVectors.ShieldCheck,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(Recipes.Glyph.md),
        )
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2f),
        ) {
            Text(
                text = VerifyCodeCopy.VERIFIED_CARD_TITLE,
                style = type.small.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = VerifyCodeCopy.VERIFIED_CARD_SUBTITLE,
                style = type.xs,
                color = Recipes.Row.labelColor,
            )
        }
        Surface(
            shape = Recipes.Badge.radius,
            color = tint.copy(alpha = 0.15f),
            border = BorderStroke(Recipes.Badge.borderWidth, tint.copy(alpha = 0.3f)),
        ) {
            Box(
                modifier =
                    Modifier.padding(
                        horizontal = Recipes.Badge.default(type).paddingX,
                        vertical = Recipes.Badge.default(type).paddingY,
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = if (expired) VerifyCodeCopy.EXPIRED_BADGE else VerifyCodeCopy.VALID_BADGE,
                    style = Recipes.Badge.default(type).text,
                    color = tint,
                )
            }
        }
    }
}

/** One detail: the site's glyph, label and value. */
@Composable
private fun DetailRow(
    glyph: ImageVector,
    label: String,
    value: String,
    accent: Boolean = false,
    danger: Boolean = false,
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current
    val valueColor =
        when {
            danger -> RoyColors.destructive
            accent -> RoyColors.primary
            else -> MaterialTheme.colorScheme.onSurface
        }

    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Icon(
            imageVector = glyph,
            contentDescription = null,
            tint = Recipes.Row.labelColor,
            modifier = Modifier.size(Recipes.Glyph.sm),
        )
        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2f),
        ) {
            Text(text = label, style = type.xs, color = Recipes.Row.labelColor)
            Text(
                text = value,
                style = type.small.copy(fontWeight = FontWeight.Bold),
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
 * not there yet, so a slow first frame cannot make the card jump.
 */
@Composable
private fun Seal(code: String, siteUrl: String) {
    val spacing = LocalRoySpacing.current
    val type = LocalRoyTypeScale.current
    val url = remember(code, siteUrl) { VerifyQrCode.urlFor(siteUrl, code) }
    val image by produceState<ImageBitmap?>(initialValue = null, url) {
        value =
            withContext(Dispatchers.Default) {
                VerifyQrCode.matrix(url)?.let { matrix ->
                    val width = matrix.width
                    val pixels =
                        IntArray(width * width) { index ->
                            if (matrix.get(index % width, index / width)) OPAQUE_DARK else OPAQUE_LIGHT
                        }
                    Bitmap.createBitmap(pixels, width, width, Bitmap.Config.ARGB_8888).asImageBitmap()
                }
            }
    }

    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        Box(
            modifier = Modifier.size(SEAL_SIZE).background(Color.White, MaterialTheme.shapes.medium),
            contentAlignment = Alignment.Center,
        ) {
            val drawn = image
            if (drawn != null) {
                Image(
                    bitmap = drawn,
                    contentDescription = url,
                    contentScale = ContentScale.Fit,
                    modifier = Modifier.size(SEAL_SIZE),
                )
            }
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2f),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = LucideVectors.ScanBarcode,
                contentDescription = null,
                tint = Recipes.Row.labelColor,
                modifier = Modifier.size(Recipes.Glyph.sm - 2f.dp),
            )
            Text(
                text = VerifyCodeCopy.SCAN_HINT,
                style = type.xs,
                color = Recipes.Row.labelColor,
                textAlign = TextAlign.Center,
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

private val SEAL_SIZE = 200.dp
private const val COPIED_MARK_MS = 2_000L
private const val OPAQUE_DARK = 0xFF111111.toInt()
private const val OPAQUE_LIGHT = 0xFFFFFFFF.toInt()
