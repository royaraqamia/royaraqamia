package com.royaraqamia.app.community

import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.TextStyle
import java.time.Instant

/**
 * How long ago an instant was, in the site's words (#1580).
 *
 * The feed card and the comment thread draw the same sentence for the same
 * timestamp on both clients, so the words come from the generated [PostTimeCopy]
 * rather than a Kotlin transcription of ICU's Arabic (ADR-0098). The clock is
 * [postTimeState]; the plural form is grammar and is picked here, in the same
 * five forms `app/community/_components/post-time.tsx` picks.
 *
 * It draws no box of its own: the footer's meta line and a comment's meta line
 * keep their own scales and pass them in.
 */
@Composable
fun PostTime(
    iso: String,
    style: TextStyle,
    color: Color,
    modifier: Modifier = Modifier,
) {
    val label = postTimeLabel(iso) ?: return
    Text(text = label, style = style, color = color, modifier = modifier)
}

/** The sentence alone, for a test and for a caller that lays out its own [Text]. */
fun postTimeLabel(iso: String, now: Instant = Instant.now()): String? {
    val state = postTimeState(iso, now) ?: return null
    return sentence(state).replace("{count}", grouped(countOf(state)))
}

private fun countOf(state: PostTimeState): Long =
    when (state) {
        PostTimeState.Now -> 0
        is PostTimeState.Minutes -> state.count
        is PostTimeState.Hours -> state.count
        is PostTimeState.Days -> state.count
        is PostTimeState.Weeks -> state.count
        is PostTimeState.Months -> state.count
        is PostTimeState.Years -> state.count
    }

/**
 * Arabic picks a form by count (CLDR `ar`): one, two, 3-10, 11-99, and 100+.
 *
 * A rung that cannot reach a form passes no word for it - a month is 1-12, so
 * months stop at `many`; a day is 1-6 and a week 1-4, so those stop at `few`.
 */
private fun form(
    count: Long,
    one: String,
    two: String,
    few: String,
    many: String = few,
    other: String = many,
): String =
    when {
        count == 1L -> one
        count == 2L -> two
        count % 100 in 3..10 -> few
        count % 100 in 11..99 -> many
        else -> other
    }

private fun sentence(state: PostTimeState): String =
    when (state) {
        PostTimeState.Now -> PostTimeCopy.NOW
        is PostTimeState.Minutes ->
            form(
                state.count,
                one = PostTimeCopy.MINUTE_ONE,
                two = PostTimeCopy.MINUTE_TWO,
                few = PostTimeCopy.MINUTE_FEW,
                many = PostTimeCopy.MINUTE_MANY,
            )
        is PostTimeState.Hours ->
            form(
                state.count,
                one = PostTimeCopy.HOUR_ONE,
                two = PostTimeCopy.HOUR_TWO,
                few = PostTimeCopy.HOUR_FEW,
                many = PostTimeCopy.HOUR_MANY,
            )
        is PostTimeState.Days ->
            form(
                state.count,
                one = PostTimeCopy.DAY_ONE,
                two = PostTimeCopy.DAY_TWO,
                few = PostTimeCopy.DAY_FEW,
            )
        is PostTimeState.Weeks ->
            form(
                state.count,
                one = PostTimeCopy.WEEK_ONE,
                two = PostTimeCopy.WEEK_TWO,
                few = PostTimeCopy.WEEK_FEW,
            )
        is PostTimeState.Months ->
            form(
                state.count,
                one = PostTimeCopy.MONTH_ONE,
                two = PostTimeCopy.MONTH_TWO,
                few = PostTimeCopy.MONTH_FEW,
                many = PostTimeCopy.MONTH_MANY,
            )
        is PostTimeState.Years ->
            form(
                state.count,
                one = PostTimeCopy.YEAR_ONE,
                two = PostTimeCopy.YEAR_TWO,
                few = PostTimeCopy.YEAR_FEW,
                many = PostTimeCopy.YEAR_MANY,
                other = PostTimeCopy.YEAR_OTHER,
            )
    }

/** `1234` -> `1,234`: the separator ICU writes for `ar-SY-u-nu-latn`. */
private fun grouped(count: Long): String =
    count.toString().reversed().chunked(3).joinToString(",").reversed()
