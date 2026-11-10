package com.royaraqamia.app.home

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.PlatformTextStyle
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.ui.vectors.LucideVectors

/** The empty state's page numbers, read from its classes (ADR-0118). */
internal object HomeEmptyMetrics {
    val horizontalPadding = 24.dp
    val verticalPadding = 64.dp
    val titleSize = 30.sp
    val titleWeight = FontWeight.Bold
    val titleLineHeight = 36.sp

    /** The page's line box, which is what the card measures rather than the face's own height. */
    val titleBoxHeight = 36.dp
    val bodySize = 16.sp
    val bodyLineHeight = 26.sp
    val bodyBoxHeight = 26.dp
    val bodyTopPadding = 16.dp
    val bodyMaxWidth = 448.dp
    val ctaTopPadding = 32.dp
    val ctaHeight = 48.dp
    val ctaGap = 10.dp
    val noteTopPadding = 12.dp
    val noteSize = 12.sp
    val noteLineHeight = 16.dp
}

/** The empty state's palette, from the site's Tailwind classes. */
private object EmptyColors {
    val Neutral400 = Color(0xFFA3A3A3)
    val Neutral500 = Color(0xFF737373)
}

/**
 * The first-run homepage (#1194, ADR-0146): no strip, one action.
 *
 * The action opens the same picker the strip's end control does, so the first app
 * is added by the same list that adds the tenth — there is no separate onboarding
 * flow to keep in step. The words and the numbers are the page's
 * (`shared/copy/home-empty.json`, `shared/visual/home.json`): a 30sp title, a
 * 16sp sentence, the landing page's hero button ([Recipes.Cta]) and the small
 * note under it.
 */
@Composable
fun HomeEmptyState(onAddApp: () -> Unit, modifier: Modifier = Modifier) {
    Column(
        modifier =
            modifier
                .fillMaxWidth()
                .fillMaxHeight()
                .testTag("home-empty")
                .padding(
                    horizontal = HomeEmptyMetrics.horizontalPadding,
                    vertical = HomeEmptyMetrics.verticalPadding,
                ),
        verticalArrangement = Arrangement.Center,
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // The page's line box is the design: `text-3xl` draws a 36px line and the
        // Arabic face's own metrics are taller than that, so the text is centred
        // in the page's box rather than letting the font decide the height.
        Box(
            modifier =
                Modifier.height(HomeEmptyMetrics.titleBoxHeight)
                    .testTag("home-empty-title"),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = HomeEmptyCopy.EMPTY_TITLE,
                style =
                    MaterialTheme.typography.headlineLarge.copy(
                        fontSize = HomeEmptyMetrics.titleSize,
                        fontWeight = HomeEmptyMetrics.titleWeight,
                        lineHeight = HomeEmptyMetrics.titleLineHeight,
                        platformStyle = PlatformTextStyle(includeFontPadding = false),
                    ),
                color = MaterialTheme.colorScheme.onBackground,
                textAlign = TextAlign.Center,
            )
        }
        Box(
            modifier =
                Modifier.padding(top = HomeEmptyMetrics.bodyTopPadding)
                    .widthIn(max = HomeEmptyMetrics.bodyMaxWidth)
                    .heightIn(min = HomeEmptyMetrics.bodyBoxHeight)
                    .testTag("home-empty-body"),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = HomeEmptyCopy.EMPTY_BODY,
                style =
                    MaterialTheme.typography.bodyMedium.copy(
                        fontSize = HomeEmptyMetrics.bodySize,
                        lineHeight = HomeEmptyMetrics.bodyLineHeight,
                        platformStyle = PlatformTextStyle(includeFontPadding = false),
                    ),
                color = EmptyColors.Neutral400,
                textAlign = TextAlign.Center,
            )
        }

        AddAppButton(
            onClick = onAddApp,
            modifier = Modifier.padding(top = HomeEmptyMetrics.ctaTopPadding),
        )

        Box(
            modifier =
                Modifier.padding(top = HomeEmptyMetrics.noteTopPadding)
                    .height(HomeEmptyMetrics.noteLineHeight),
            contentAlignment = Alignment.Center,
        ) {
            Text(
                text = HomeEmptyCopy.EMPTY_NOTE,
                style =
                    MaterialTheme.typography.labelSmall.copy(
                        fontSize = HomeEmptyMetrics.noteSize,
                        platformStyle = PlatformTextStyle(includeFontPadding = false),
                    ),
                color = EmptyColors.Neutral500,
                textAlign = TextAlign.Center,
            )
        }
    }
}

/** The landing page's hero button, in its first-run position. */
@Composable
private fun AddAppButton(onClick: () -> Unit, modifier: Modifier = Modifier) {
    val type = LocalRoyTypeScale.current
    Row(
        modifier =
            modifier
                .widthIn(min = Recipes.Cta.minWidth)
                .height(HomeEmptyMetrics.ctaHeight)
                .shadow(
                    elevation = Recipes.Cta.bloomY,
                    shape = Recipes.Cta.radius,
                    ambientColor = Recipes.Cta.bloom,
                    spotColor = Recipes.Cta.bloom,
                )
                .clip(Recipes.Cta.radius)
                .background(Brush.horizontalGradient(Recipes.Cta.stops))
                .border(Recipes.Cta.border, Recipes.Cta.radius)
                .clickable(onClick = onClick)
                .testTag("home-empty-add")
                .padding(horizontal = Recipes.Cta.paddingX),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(HomeEmptyMetrics.ctaGap),
    ) {
        Icon(
            imageVector = LucideVectors.Plus,
            contentDescription = null,
            tint = Recipes.Cta.content,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = HomeEmptyCopy.EMPTY_CTA,
            style =
                Recipes.Cta.text(type).copy(
                    platformStyle = PlatformTextStyle(includeFontPadding = false)
                ),
            color = Recipes.Cta.content,
            maxLines = 1,
        )
    }
}
