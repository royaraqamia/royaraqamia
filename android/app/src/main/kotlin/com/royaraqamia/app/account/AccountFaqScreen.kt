package com.royaraqamia.app.account

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.expandVertically
import androidx.compose.animation.shrinkVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.semantics.Role
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import com.royaraqamia.app.theme.RoyColors
import com.royaraqamia.app.theme.RoyShape
import com.royaraqamia.app.ui.vectors.LucideVectors

/**
 * The FAQ, as the site's `/account/faq` draws it (#949).
 *
 * The second client of `frontend/ui/account/faq-view.tsx`, not a second design:
 * the same questions and answers from `shared/copy/account-faq.json`, the same
 * `rounded-2xl` card, the same open-first row, the same chevron that turns over
 * when a question opens, and the same divider above the answer. `docs/mobile/parity.json`
 * lists the pair and `npm run check:parity` fails a state or a string that exists
 * on one side only.
 *
 * The content is static, so there is no read and no retry face: one state
 * ([AccountFaqState.AtRest]) is the whole screen.
 */
@Composable
fun AccountFaqScreen(modifier: Modifier = Modifier) {
    var openIndex by remember { mutableIntStateOf(0) }

    Column(
        modifier =
            modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = AccountFaqMetrics.horizontalPadding)
                .padding(top = AccountFaqMetrics.topPadding),
        verticalArrangement = Arrangement.spacedBy(AccountFaqMetrics.titleToAccordion),
    ) {
        Text(
            text = AccountFaqCopy.PAGE_TITLE,
            modifier =
                Modifier.fillMaxWidth()
                    .height(AccountFaqMetrics.titleHeight)
                    .testTag(AccountFaqMetrics.TITLE),
            style =
                TextStyle(
                    fontSize = AccountFaqMetrics.titleSize,
                    lineHeight = AccountFaqMetrics.titleLineHeight,
                    fontWeight = AccountFaqMetrics.titleWeight,
                    letterSpacing = AccountFaqMetrics.titleTracking,
                    textAlign = TextAlign.Center,
                    brush =
                        Brush.horizontalGradient(
                            listOf(
                                AccountFaqMetrics.titleStart,
                                AccountFaqMetrics.titleMiddle,
                                AccountFaqMetrics.titleEnd,
                            )
                        ),
                ),
        )

        Column(
            modifier = Modifier.fillMaxWidth().testTag(AccountFaqMetrics.LIST),
            verticalArrangement = Arrangement.spacedBy(AccountFaqMetrics.rowGap),
        ) {
            AccountFaqMetrics.entries.forEachIndexed { index, entry ->
                FaqRow(
                    entry = entry,
                    index = index,
                    open = openIndex == index,
                    onToggle = { openIndex = if (openIndex == index) -1 else index },
                )
            }
        }
    }
}

/** One card: the question and its chevron, then the answer while it is open. */
@Composable
private fun FaqRow(
    entry: AccountFaqEntry,
    index: Int,
    open: Boolean,
    onToggle: () -> Unit,
) {
    val border =
        if (open) AccountFaqMetrics.openBorder else AccountFaqMetrics.closedBorder
    val surface =
        if (open) AccountFaqMetrics.openSurface else AccountFaqMetrics.closedSurface

    Column(
        modifier =
            Modifier.fillMaxWidth()
                .testTag(AccountFaqMetrics.rowTag(index))
                .clip(RoyShape.card)
                .background(surface)
                .border(AccountFaqMetrics.borderWidth, border, RoyShape.card)
                // The site's border is part of the card's box (`box-sizing:
                // border-box`), so the measured height includes it. Compose paints
                // the border inside the bounds without consuming space, so the
                // same 1dp is added as padding for the boxes to line up.
                .padding(AccountFaqMetrics.borderWidth),
    ) {
        Row(
            modifier =
                Modifier.fillMaxWidth()
                    .testTag(AccountFaqMetrics.questionTag(index))
                    .clickable(role = Role.Button, onClick = onToggle)
                    .padding(
                        horizontal = AccountFaqMetrics.rowPaddingHorizontal,
                        vertical = AccountFaqMetrics.rowPaddingVertical,
                    ),
            horizontalArrangement = Arrangement.spacedBy(AccountFaqMetrics.questionGap),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                text = entry.question,
                modifier = Modifier.weight(1f).testTag(AccountFaqMetrics.questionTextTag(index)),
                color = if (open) AccountFaqMetrics.openQuestionColor else MaterialTheme.colorScheme.onSurface,
                fontSize = AccountFaqMetrics.questionSize,
                lineHeight = AccountFaqMetrics.questionLineHeight,
                fontWeight = AccountFaqMetrics.questionWeight,
            )
            Chevron(open = open)
        }

        AnimatedVisibility(
            visible = open,
            enter = expandVertically(expandFrom = Alignment.Top),
            exit = shrinkVertically(shrinkTowards = Alignment.Top),
        ) {
            Column(
                modifier =
                    Modifier.fillMaxWidth()
                        .testTag(AccountFaqMetrics.answerTag(index))
                        .padding(horizontal = AccountFaqMetrics.rowPaddingHorizontal)
                        .padding(top = AccountFaqMetrics.answerTopPadding)
                        .padding(bottom = AccountFaqMetrics.rowPaddingVertical + 4.dp),
            ) {
                Box(
                    modifier =
                        Modifier.fillMaxWidth()
                            .height(AccountFaqMetrics.dividerWidth)
                            .background(AccountFaqMetrics.dividerBrush),
                )
                Text(
                    text = entry.answer,
                    modifier = Modifier.padding(top = AccountFaqMetrics.dividerToAnswer),
                    color = AccountFaqMetrics.answerColor,
                    fontSize = AccountFaqMetrics.answerSize,
                    lineHeight = AccountFaqMetrics.answerLineHeight,
                    fontWeight = FontWeight.Normal,
                )
            }
        }
    }
}

/** The site's round chevron: muted when closed, filled and turned over when open. */
@Composable
private fun Chevron(open: Boolean) {
    val rotation by
        animateFloatAsState(
            targetValue = if (open) 180f else 0f,
            label = "account-faq-chevron",
        )

    Box(
        modifier =
            Modifier.size(AccountFaqMetrics.chevronSize)
                .clip(RoundedCornerShape(AccountFaqMetrics.chevronRadius))
                .background(if (open) AccountFaqMetrics.chevronOpenSurface else AccountFaqMetrics.chevronClosedSurface),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = LucideVectors.ChevronDown,
            contentDescription = null,
            tint = if (open) Color.White else AccountFaqMetrics.chevronClosedColor,
            modifier = Modifier.size(AccountFaqMetrics.chevronIcon).rotate(rotation),
        )
    }
}

/** The page's numbers, in the units both clients measure at 393 x 852. */
internal object AccountFaqMetrics {
    const val TITLE = "faq-title"
    const val LIST = "faq-list"

    fun rowTag(index: Int): String = "faq-row-$index"
    fun questionTag(index: Int): String = "faq-question-$index"
    fun questionTextTag(index: Int): String = "faq-question-text-$index"
    fun answerTag(index: Int): String = "faq-answer-$index"

    val horizontalPadding = 16.dp
    val topPadding = 24.dp

    val titleSize = 30.sp
    val titleLineHeight = 46.5.sp
    val titleHeight = 46.5.dp
    val titleWeight = FontWeight.ExtraBold
    val titleTracking = (-0.025).em
    val titleToAccordion = 40.dp
    val titleStart = Color(0xFFA684FF)
    val titleMiddle = Color(0xFFED6AFF)
    val titleEnd = Color(0xFF7C86FF)

    val cardRadius = 16.dp
    val rowGap = 14.dp
    val rowPaddingHorizontal = 20.dp
    val rowPaddingVertical = 16.dp
    val questionGap = 16.dp
    val questionSize = 16.sp
    val questionLineHeight = 26.sp
    val questionWeight = FontWeight.Bold
    val borderWidth = 1.dp

    val chevronSize = 36.dp
    val chevronRadius = 12.dp
    val chevronIcon = 20.dp

    val answerTopPadding = 4.dp
    val dividerWidth = 1.dp
    val dividerToAnswer = 15.75.dp
    val answerSize = 14.sp
    val answerLineHeight = 22.75.sp

    val openBorder: Color get() = Color(0xFF8B5CF6).copy(alpha = 0.4f)
    val closedBorder: Color get() = RoyColors.border.copy(alpha = 0.6f)
    val openSurface: Color get() = RoyColors.card
    val closedSurface: Color get() = RoyColors.card.copy(alpha = 0.95f)
    val openQuestionColor: Color get() = Color(0xFFC4B5FD)
    val chevronOpenSurface: Color get() = Color(0xFF7C3AED)
    val chevronClosedSurface: Color get() = RoyColors.muted.copy(alpha = 0.8f)
    val chevronClosedColor: Color get() = RoyColors.mutedForeground
    val answerColor: Color get() = RoyColors.mutedForeground.copy(alpha = 0.9f)
    val dividerBrush: Brush
        get() =
            Brush.horizontalGradient(
                listOf(Color.Transparent, RoyColors.border.copy(alpha = 0.6f), Color.Transparent)
            )

    val entries: List<AccountFaqEntry> =
        listOf(
            AccountFaqEntry(AccountFaqCopy.QUESTION1, AccountFaqCopy.ANSWER1),
            AccountFaqEntry(AccountFaqCopy.QUESTION2, AccountFaqCopy.ANSWER2),
            AccountFaqEntry(AccountFaqCopy.QUESTION3, AccountFaqCopy.ANSWER3),
            AccountFaqEntry(AccountFaqCopy.QUESTION4, AccountFaqCopy.ANSWER4),
            AccountFaqEntry(AccountFaqCopy.QUESTION5, AccountFaqCopy.ANSWER5),
            AccountFaqEntry(AccountFaqCopy.QUESTION6, AccountFaqCopy.ANSWER6),
            AccountFaqEntry(AccountFaqCopy.QUESTION7, AccountFaqCopy.ANSWER7),
        )
}

/** One question and its answer, from the generated copy. */
internal data class AccountFaqEntry(val question: String, val answer: String)
