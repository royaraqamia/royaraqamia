package com.royaraqamia.app.news

import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import com.royaraqamia.app.contracts.generated.NewsBoardResponseBoard
import com.royaraqamia.app.contracts.generated.NewsBoardResponseBoardDay
import com.royaraqamia.app.contracts.generated.NewsBoardResponseBoardDayDigest
import com.royaraqamia.app.contracts.generated.NewsBoardResponseBoardDayStoriesItem
import com.royaraqamia.app.contracts.generated.NewsBoardResponseBoardDayStoriesItemCategory
import com.royaraqamia.app.contracts.generated.NewsBoardResponseBoardDayStoriesItemRegion
import com.royaraqamia.app.contracts.generated.NewsBoardResponseBoardPersonal
import com.royaraqamia.app.shared.NeedsConnectionCopy
import com.royaraqamia.app.shared.ReadFailureCopy
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The digest's faces (#926): a live board, a last-seen board that says so, and
 * the two failures ADR-0031 keeps apart.
 *
 * The personal badge is held here too, because it is the one control that tells
 * a reader the digest they are looking at is their own rather than the shared
 * one.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class,
)
class NewsDigestScreenStatesTest {
    @get:Rule val compose = createComposeRule()

    private val board =
        NewsBoardResponseBoard(
            day =
                NewsBoardResponseBoardDay(
                    digest =
                        NewsBoardResponseBoardDayDigest(
                            id = "digest-1",
                            date = "2026-11-08",
                            title = "ملخّص اليوم",
                            lede = "مقدّمة",
                            storyCount = 1,
                            model = "model-1",
                            publishedAt = "2026-11-08T06:00:00.000Z",
                        ),
                    stories =
                        listOf(
                            NewsBoardResponseBoardDayStoriesItem(
                                id = "story-1",
                                position = 1,
                                category = NewsBoardResponseBoardDayStoriesItemCategory.TECH,
                                region = NewsBoardResponseBoardDayStoriesItemRegion.ARAB,
                                headline = "خبر تقني",
                                summary = "ملخّص الخبر",
                                whyItMatters = null,
                                sourceId = "tech-daily",
                                sourceName = "تقنية اليوم",
                                sourceUrl = "https://example.com/story",
                                sourcePublishedAt = null,
                            )
                        ),
                ),
            dates = listOf("2026-11-08", "2026-11-07"),
            search = null,
            hasAnyDigest = true,
            preferences = null,
            personal = null,
            cards = null,
        )

    @Test
    fun `a live board draws the page title and its stories`() {
        compose.setContent {
            RoyaraqamiaTheme {
                NewsDigestScreen(state = NewsDigestUiState.Live(board))
            }
        }

        compose.onNodeWithText(NewsPageCopy.PAGE_TITLE).assertExists()
        compose.onNodeWithText("خبر تقني").assertExists()
    }

    @Test
    fun `a last-seen board says it is a saved copy`() {
        compose.setContent {
            RoyaraqamiaTheme {
                NewsDigestScreen(state = NewsDigestUiState.Snapshot(board))
            }
        }

        compose.onNodeWithText(NewsDigestCopy.STALE_MESSAGE).assertExists()
        compose.onNodeWithText("خبر تقني").assertExists()
    }

    @Test
    fun `the reader's own digest is named as theirs`() {
        compose.setContent {
            RoyaraqamiaTheme {
                NewsDigestScreen(
                    state =
                        NewsDigestUiState.Live(
                            board.copy(
                                personal =
                                    NewsBoardResponseBoardPersonal(
                                        available = true,
                                        active = true,
                                        ownSources = null,
                                    )
                            )
                        )
                )
            }
        }

        compose.onNodeWithText(NewsDigestCopy.PERSONAL_ACTIVE).assertExists()
        compose.onNodeWithText(NewsDigestCopy.SHOW_PUBLIC).assertExists()
    }

    @Test
    fun `an unreachable server names the connection`() {
        compose.setContent {
            RoyaraqamiaTheme {
                NewsDigestScreen(state = NewsDigestUiState.Unavailable(offline = true), onRetry = {})
            }
        }

        compose.onNodeWithText(NeedsConnectionCopy.TITLE).assertExists()
        compose.onNodeWithText(ReadFailureCopy.TITLE).assertDoesNotExist()
    }

    @Test
    fun `a refusal names the read failure, not the connection`() {
        compose.setContent {
            RoyaraqamiaTheme {
                NewsDigestScreen(state = NewsDigestUiState.Unavailable(offline = false), onRetry = {})
            }
        }

        compose.onNodeWithText(ReadFailureCopy.TITLE).assertExists()
        compose.onNodeWithText(NeedsConnectionCopy.TITLE).assertDoesNotExist()
    }
}
