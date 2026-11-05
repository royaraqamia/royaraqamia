package com.royaraqamia.app.consultation

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextContains
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performTextInput
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.AvailabilitySlotsResponseSlotsItem
import com.royaraqamia.app.contracts.generated.ConsultationPackagesResponsePackagesItem
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The booking screen's two rules the repository cannot show (#930): with no radio
 * it reads nothing and offers no write, and a confirmed booking shows the
 * reference code the visitor quotes.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class,
)
class ConsultationScreenTest {
    @get:Rule val compose = createComposeRule()

    private val pkg =
        ConsultationPackagesResponsePackagesItem(
            id = "p-1",
            name = "جلسة واحدة",
            description = null,
            price_usd = 25.0,
            duration_minutes = 60.0,
            sessions_count = 1.0,
            is_active = true,
            sort_order = 0.0,
        )

    private val slot =
        AvailabilitySlotsResponseSlotsItem(
            id = "s-1",
            starts_at = "2026-08-26T12:00:00Z",
            ends_at = "2026-08-26T13:00:00Z",
        )

    private fun draw(
        online: Boolean,
        packageReads: () -> Unit = {},
        loadSlots: suspend () -> ApiResult<List<AvailabilitySlotsResponseSlotsItem>> = {
            ApiResult.Success(emptyList())
        },
        book: suspend (ConsultationDraft) -> BookingAttempt = {
            BookingAttempt.Confirmed("CONS-2026-A7K2M9QX")
        },
    ) {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        ConsultationScreen(
                            loadPackages = {
                                packageReads()
                                ApiResult.Success(listOf(pkg))
                            },
                            loadSlots = loadSlots,
                            book = book,
                            online = online,
                            onCopy = {},
                        )
                    }
                }
            }
        }
    }

    @Test
    fun `offline the screen says so and reads and writes nothing`() {
        var packageReads = 0
        var bookings = 0
        draw(
            online = false,
            packageReads = { packageReads += 1 },
            book = {
                bookings += 1
                BookingAttempt.Confirmed("unused")
            },
        )

        compose.waitForIdle()
        compose.onNodeWithTag(ConsultationTags.OFFLINE).assertExists()
        compose.onNodeWithTag(ConsultationTags.NEXT).assertIsNotEnabled()
        compose.onNodeWithTag(ConsultationTags.NEXT).performClick()
        compose.waitForIdle()

        assertEquals("the catalogue was not read offline", 0, packageReads)
        assertEquals("no write left the screen", 0, bookings)
    }

    @Test
    fun `a taken slot says so and reads the calendar again`() {
        var slotReads = 0
        draw(
            online = true,
            loadSlots = {
                slotReads += 1
                ApiResult.Success(listOf(slot))
            },
            book = { BookingAttempt.Taken("نأسف، سبقك شخص آخر إلى أحد هذه المواعيد. اختر مواعيد جديدة.") },
        )

        compose.waitForIdle()
        compose.onNodeWithTag(ConsultationTags.packageTag("p-1")).performClick()
        compose.onNodeWithTag(ConsultationTags.NEXT).performClick()
        compose.waitForIdle()
        compose.onNodeWithTag(ConsultationTags.slot("s-1")).performClick()
        compose.onNodeWithTag(ConsultationTags.NEXT).performClick()
        compose.waitForIdle()

        compose.onNodeWithTag(ConsultationTags.NAME).performTextInput("أحمد")
        compose.onNodeWithTag(ConsultationTags.PHONE).performTextInput("+963968478904")
        compose.onNodeWithTag(ConsultationTags.TOPIC)
            .performTextInput("أريد مراجعة خطتي لمشروع رقمي صغير.")
        compose.onNodeWithTag(ConsultationTags.NEXT).performClick()
        compose.waitForIdle()

        compose.onNodeWithTag(ConsultationTags.ERROR).assertTextContains("سبقك", substring = true)
        assertEquals("the calendar was read once on arrival and once after the conflict", 2, slotReads)
    }

    @Test
    fun `a confirmed booking shows its reference code`() {
        draw(online = true, loadSlots = { ApiResult.Success(listOf(slot)) })

        compose.waitForIdle()
        compose.onNodeWithTag(ConsultationTags.packageTag("p-1")).performClick()
        compose.onNodeWithTag(ConsultationTags.NEXT).performClick()
        compose.waitForIdle()
        compose.onNodeWithTag(ConsultationTags.slot("s-1")).performClick()
        compose.onNodeWithTag(ConsultationTags.NEXT).performClick()
        compose.waitForIdle()

        compose.onNodeWithTag(ConsultationTags.NAME).performTextInput("أحمد")
        compose.onNodeWithTag(ConsultationTags.PHONE).performTextInput("+963968478904")
        compose.onNodeWithTag(ConsultationTags.TOPIC)
            .performTextInput("أريد مراجعة خطتي لمشروع رقمي صغير.")
        compose.onNodeWithTag(ConsultationTags.NEXT).performClick()
        compose.waitForIdle()

        compose.onNodeWithTag(ConsultationTags.RECEIPT).assertExists()
    }
}
