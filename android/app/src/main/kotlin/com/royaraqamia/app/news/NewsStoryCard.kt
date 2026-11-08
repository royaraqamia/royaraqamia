package com.royaraqamia.app.news

import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Icon
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.contracts.generated.NewsBoardResponseBoardDayStoriesItem
import com.royaraqamia.app.contracts.generated.NewsBoardResponseBoardSearchHitsItem
import com.royaraqamia.app.theme.LocalRoySpacing
import com.royaraqamia.app.theme.LocalRoyTypeScale
import com.royaraqamia.app.theme.Recipes
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * One story, after both generated story shapes are reduced to this (#926).
 *
 * The board answers a day's stories and a search's hits as two different JSON
 * types, and the card must not care which one it came from. [NewsStoryView] is
 * the card's own interface: the screen maps either shape onto it once, and the
 * drawing has one input rather than a branch in every line.
 */
internal data class NewsStoryView(
    val id: String,
    val category: String,
    val region: String,
    val headline: String,
    val summary: String,
    val sourceName: String,
    val sourceUrl: String,
)

internal fun NewsBoardResponseBoardDayStoriesItem.toView(): NewsStoryView =
    NewsStoryView(
        id = id,
        category = category.name.lowercase(),
        region = region.name.lowercase(),
        headline = headline,
        summary = summary,
        sourceName = sourceName,
        sourceUrl = sourceUrl,
    )

internal fun NewsBoardResponseBoardSearchHitsItem.toView(): NewsStoryView =
    NewsStoryView(
        id = id,
        category = category.name.lowercase(),
        region = region.name.lowercase(),
        headline = headline,
        summary = summary,
        sourceName = sourceName,
        sourceUrl = sourceUrl,
    )

/**
 * One story in the digest, the app's half of `frontend/ui/news/StoryCard.tsx`.
 *
 * The page's card is a plain read-only row: a category chip, the region, the
 * headline, the summary and the link back to the source. Every word comes from
 * the generated [NewsStoryCopy]; the glyph is the site's own `ArrowUpLeft` from
 * the generated vectors, so the two clients cannot pick different pictures for
 * one control (ADR-0100).
 *
 * The page's relative timestamp is deliberately not drawn here yet: it is an
 * `Intl.RelativeTimeFormat` sentence with no shared copy source between the two
 * clients, and a retyped Arabic sentence is the drift this pair exists to
 * prevent. The source's name is the card's recency-free attribution.
 */
@Composable
internal fun NewsStoryCard(
    story: NewsStoryView,
    onOpenUrl: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val type = LocalRoyTypeScale.current
    val spacing = LocalRoySpacing.current
    val shape = RoundedCornerShape(16.dp)

    Surface(
        modifier = modifier.fillMaxWidth().testTag(NewsDigestMetrics.STORY),
        shape = shape,
        color = RoyColors.card.copy(alpha = 0.85f),
        border = BorderStroke(1.dp, RoyColors.border.copy(alpha = 0.6f)),
    ) {
        Column(
            modifier = Modifier.fillMaxWidth().padding(spacing.cardPadding),
            verticalArrangement = Arrangement.spacedBy(spacing.elementGapSm),
        ) {
            Row(
                horizontalArrangement = Arrangement.spacedBy(8.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Surface(
                    shape = Recipes.Badge.radius,
                    color = RoyColors.primary.copy(alpha = 0.1f),
                    border = BorderStroke(1.dp, RoyColors.primary.copy(alpha = 0.3f)),
                ) {
                    Text(
                        text = categoryLabel(story.category),
                        modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                        style = type.xs.copy(fontWeight = FontWeight.Bold),
                        color = RoyColors.primary,
                        maxLines = 1,
                    )
                }
                Text(
                    text = regionLabel(story.region),
                    style = type.xs,
                    color = RoyColors.mutedForeground,
                    maxLines = 1,
                )
            }

            Text(
                text = story.headline,
                style = type.h4.copy(fontWeight = FontWeight.ExtraBold),
                color = RoyColors.foreground,
            )

            Text(
                text = story.summary,
                style = type.small,
                color = RoyColors.mutedForeground,
            )

            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                Text(
                    text = story.sourceName,
                    style = type.xs.copy(fontWeight = FontWeight.Bold),
                    color = RoyColors.foreground.copy(alpha = 0.8f),
                    maxLines = 1,
                )
                Spacer(Modifier.width(spacing.elementGapSm))
                Box(modifier = Modifier.weight(1f))
                Row(
                    modifier =
                        Modifier.testTag(NewsDigestMetrics.STORY_SOURCE)
                            .clickable { onOpenUrl(story.sourceUrl) }
                            .padding(horizontal = 8.dp, vertical = 4.dp),
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Text(
                        text = NewsStoryCopy.SOURCE,
                        style = type.xs.copy(fontWeight = FontWeight.Bold),
                        color = RoyColors.primary,
                    )
                    Icon(
                        imageVector = LucideVectors.ArrowUpLeft,
                        contentDescription =
                            NewsStoryCopy.SOURCE_ARIA.replace("{sourceName}", story.sourceName),
                        tint = RoyColors.primary,
                        modifier = Modifier.size(14.dp),
                    )
                }
            }
        }
    }
}

private fun categoryLabel(value: String): String =
    when (value) {
        "tech" -> NewsStoryCopy.CATEGORY_TECH
        "politics" -> NewsStoryCopy.CATEGORY_POLITICS
        "religion" -> NewsStoryCopy.CATEGORY_RELIGION
        "economy" -> NewsStoryCopy.CATEGORY_ECONOMY
        "world" -> NewsStoryCopy.CATEGORY_WORLD
        else -> NewsStoryCopy.CATEGORY_OTHER
    }

private fun regionLabel(value: String): String =
    when (value) {
        "arab" -> NewsStoryCopy.REGION_ARAB
        "islamic" -> NewsStoryCopy.REGION_ISLAMIC
        else -> NewsStoryCopy.REGION_WORLD
    }
