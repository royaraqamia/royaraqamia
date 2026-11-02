package com.royaraqamia.app.verify

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
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

/**
 * The verified certificate, as the site's card draws it (#658, ADR-0098).
 *
 * The second client of `frontend/ui/verify/certificate-result-card.tsx`: the same
 * header (a shield, the two sentences and the validity badge), the same highlight
 * block with the holder and the course, the same detail rows, and the same words —
 * generated from `shared/copy/certificate-result.json` rather than retyped.
 * `docs/mobile/parity.json` lists the pair and `npm run check:parity` fails a
 * state or a string that exists on one side only.
 *
 * The two states are [CertificateResultState], not a boolean: an expired
 * certificate is a different card — destructive badge, destructive expiry value —
 * and the date it expired is still shown, because the reader needs to know *when*
 * rather than only that it is over.
 *
 * Copying the code is the caller's ([VerifyScreen]): the platform clipboard is a
 * shell concern, and a card that reached for it could not be drawn in a test.
 */
@Composable
fun CertificateResultCard(
    certificate: VerifyResultCertificate,
    state: CertificateResultState,
    copied: Boolean,
    onCopy: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val spacing = LocalRoySpacing.current
    val expired = state is CertificateResultState.Expired

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoyShape.card,
        color = RoyColors.card.copy(alpha = 0.9f),
        border = BorderStroke(1f.dp, RoyColors.success.copy(alpha = if (expired) 0.2f else 0.3f)),
    ) {
        Column(modifier = Modifier.fillMaxWidth()) {
            Header(expired = expired)
            Column(
                modifier = Modifier.padding(Recipes.Card.padding(spacing)),
                verticalArrangement = Arrangement.spacedBy(spacing.elementGap),
            ) {
                Highlight(certificate)
                Details(certificate = certificate, expired = expired, copied = copied, onCopy = onCopy)
            }
        }
    }
}

/** The site's banner: the shield, the claim, and the badge that qualifies it. */
@Composable
private fun Header(expired: Boolean) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Row(
        modifier =
            Modifier.fillMaxWidth()
                .background(RoyColors.success.copy(alpha = 0.08f))
                .padding(
                    horizontal = Recipes.Card.padding(spacing),
                    vertical = spacing.elementGap,
                ),
        horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier =
                Modifier.size(Recipes.Glyph.md + spacing.elementGapSm)
                    .clip(MaterialTheme.shapes.large)
                    .background(RoyColors.success.copy(alpha = 0.15f))
                    .border(1f.dp, RoyColors.success.copy(alpha = 0.3f), MaterialTheme.shapes.large),
            contentAlignment = Alignment.Center,
        ) {
            Icon(
                imageVector = LucideVectors.ShieldCheck,
                contentDescription = null,
                tint = RoyColors.success,
                modifier = Modifier.size(Recipes.Glyph.md),
            )
        }

        Column(
            modifier = Modifier.weight(1f),
            verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2f),
        ) {
            Text(
                text = CertificateResultCopy.VERIFIED_TITLE,
                style = type.small.copy(fontWeight = FontWeight.Bold),
                color = MaterialTheme.colorScheme.onSurface,
            )
            Text(
                text = CertificateResultCopy.VERIFIED_BODY,
                style = type.xs,
                color = Recipes.Row.labelColor,
            )
        }

        ValidityMark(expired)
    }
}

/** The site's two badges: `شهادة صالحة ومُوثَّقة`, or `شهادة منتهية`. */
@Composable
private fun ValidityMark(expired: Boolean) {
    val size = Recipes.Badge.default(LocalRoyTypeScale.current)
    val tint = if (expired) RoyColors.destructive else RoyColors.success

    Surface(
        shape = Recipes.Badge.radius,
        color = tint.copy(alpha = 0.15f),
        border = BorderStroke(Recipes.Badge.borderWidth, tint.copy(alpha = 0.3f)),
    ) {
        Box(
            modifier =
                Modifier.padding(horizontal = size.paddingX, vertical = size.paddingY),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text =
                    if (expired) CertificateResultCopy.EXPIRED_BADGE
                    else CertificateResultCopy.VALID_BADGE,
                style = size.text,
                color = tint,
            )
        }
    }
}

/** The holder and the course, in the site's tinted block. */
@Composable
private fun Highlight(certificate: VerifyResultCertificate) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Column(
        modifier =
            Modifier.fillMaxWidth()
                .clip(RoyShape.card)
                .background(RoyColors.primary.copy(alpha = 0.05f))
                .border(1f.dp, RoyColors.primary.copy(alpha = 0.15f), RoyShape.card)
                .padding(spacing.elementGap),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGap),
    ) {
        HighlightField(
            glyph = LucideVectors.User,
            label = CertificateResultCopy.STUDENT_HEADING,
            value = certificate.student_name,
            emphasised = true,
        )
        HighlightField(
            glyph = LucideVectors.GraduationCap,
            label = CertificateResultCopy.COURSE_HEADING,
            value = certificate.course_name,
            emphasised = false,
        )
    }
}

@Composable
private fun HighlightField(
    glyph: ImageVector,
    label: String,
    value: String,
    emphasised: Boolean,
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current

    Column(verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2f)) {
        Row(
            horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2f),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = glyph,
                contentDescription = null,
                tint = RoyColors.primary,
                modifier = Modifier.size(Recipes.Glyph.sm - 2f.dp),
            )
            Text(text = label, style = type.xs, color = Recipes.Row.labelColor)
        }
        Text(
            text = value,
            style = if (emphasised) type.body.copy(fontWeight = FontWeight.Bold) else type.small,
            color = MaterialTheme.colorScheme.onSurface,
        )
    }
}

/** The site's grid of label/value rows: the code first, with its copy action. */
@Composable
private fun Details(
    certificate: VerifyResultCertificate,
    expired: Boolean,
    copied: Boolean,
    onCopy: (String) -> Unit,
) {
    val spacing = LocalRoySpacing.current

    Column(
        modifier = Modifier.fillMaxWidth(),
        verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
    ) {
        DetailRow(
            glyph = LucideVectors.Hash,
            label = CertificateResultCopy.CODE_LABEL,
            value = certificate.certificate_code,
            accent = true,
            trailing = { CopyAction(copied = copied, onClick = { onCopy(certificate.certificate_code) }) },
        )
        DetailRow(
            glyph = LucideVectors.User,
            label = CertificateResultCopy.STUDENT_LABEL,
            value = certificate.student_name,
        )
        DetailRow(
            glyph = LucideVectors.GraduationCap,
            label = CertificateResultCopy.COURSE_LABEL,
            value = certificate.course_name,
        )
        DetailRow(
            glyph = LucideVectors.CalendarDays,
            label = CertificateResultCopy.ISSUED_LABEL,
            value = CertificateDates.label(certificate.issue_date),
        )
        val expires = certificate.expiration_date
        if (expires != null) {
            DetailRow(
                glyph = LucideVectors.Clock,
                label = CertificateResultCopy.EXPIRES_LABEL,
                value = CertificateDates.label(expires),
                danger = expired,
            )
        }
        val grade = certificate.grade_or_status
        if (grade != null) {
            DetailRow(
                glyph = LucideVectors.Trophy,
                label = CertificateResultCopy.GRADE_LABEL,
                value = grade,
            )
        }
    }
}

@Composable
private fun DetailRow(
    glyph: ImageVector,
    label: String,
    value: String,
    accent: Boolean = false,
    danger: Boolean = false,
    trailing: (@Composable () -> Unit)? = null,
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current
    val valueColor =
        when {
            danger -> RoyColors.destructive
            accent -> RoyColors.primary
            else -> MaterialTheme.colorScheme.onSurface
        }

    Surface(
        modifier = Modifier.fillMaxWidth(),
        shape = RoyShape.card,
        color = RoyColors.muted.copy(alpha = 0.35f),
        border = BorderStroke(1f.dp, RoyColors.border.copy(alpha = 0.5f)),
    ) {
        Row(
            modifier =
                Modifier.fillMaxWidth()
                    .padding(
                        horizontal = spacing.elementGapSm,
                        vertical = spacing.elementGapSm,
                    ),
            horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Box(
                modifier =
                    Modifier.size(Recipes.Glyph.md + spacing.elementGapSm)
                        .clip(MaterialTheme.shapes.medium)
                        .background(RoyColors.background)
                        .border(1f.dp, RoyColors.border.copy(alpha = 0.6f), MaterialTheme.shapes.medium),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = glyph,
                    contentDescription = null,
                    tint = Recipes.Row.labelColor,
                    modifier = Modifier.size(Recipes.Glyph.sm),
                )
            }

            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2f),
            ) {
                Text(text = label, style = type.xs, color = Recipes.Row.labelColor)
                Text(
                    text = value,
                    style = type.small.copy(fontWeight = FontWeight.Bold),
                    color = valueColor,
                    textAlign = TextAlign.Start,
                )
            }

            trailing?.invoke()
        }
    }
}

/** The site's copy pill: `نسخ`, or `تمَّ النَّسخ` once the clipboard took it. */
@Composable
private fun CopyAction(copied: Boolean, onClick: () -> Unit) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current
    val tint = if (copied) RoyColors.success else MaterialTheme.colorScheme.onSurfaceVariant

    Surface(
        modifier = Modifier.clickable(onClick = onClick),
        shape = MaterialTheme.shapes.medium,
        color = RoyColors.muted.copy(alpha = 0.5f),
        border = BorderStroke(1f.dp, RoyColors.border.copy(alpha = 0.6f)),
    ) {
        Row(
            modifier =
                Modifier.padding(
                    horizontal = spacing.elementGapSm,
                    vertical = spacing.elementGapSm / 2f,
                ),
            horizontalArrangement = Arrangement.spacedBy(spacing.elementGapSm / 2f),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Icon(
                imageVector = if (copied) LucideVectors.Check else LucideVectors.Copy,
                // The site labels the button with the same sentence, so a screen
                // reader hears what the glyph means.
                contentDescription = CertificateResultCopy.COPY_ARIA,
                tint = tint,
                modifier = Modifier.size(Recipes.Glyph.sm - 2f.dp),
            )
            Text(
                text = if (copied) CertificateResultCopy.COPIED else CertificateResultCopy.COPY,
                style = type.xs.copy(fontWeight = FontWeight.Bold),
                color = tint,
            )
        }
    }
}
