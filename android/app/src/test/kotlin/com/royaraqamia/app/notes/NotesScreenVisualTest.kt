package com.royaraqamia.app.notes

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.width
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.test.getUnclippedBoundsInRoot
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import com.github.takahirom.roborazzi.captureRoboImage
import com.royaraqamia.app.store.notes.NoteRow
import com.royaraqamia.app.theme.RoyaraqamiaTheme
import java.io.File
import java.time.Instant
import org.json.JSONObject
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode

/**
 * The app's half of the visual gate for `/?tab=/notes` (#1628, ADR-0118).
 *
 * It composes the two states the page's contract names at the viewport the page
 * was recorded at - 393 x 852 CSS px, Arabic, RTL, dark, reduced motion - and
 * writes every named element's box and style to `app.json` and the contract's
 * capture region to `app.png`. `check:visual` compares them with the page's
 * recording. The boxes are measured; the type sizes and radii the contract asks
 * for are read from [NotesMetrics], the object the screen draws with.
 *
 * The note is the page's own fixture: the words typed through its composer and
 * a stamp from this instant, so the editor's word count and relative time read
 * the same on both sides.
 */
@RunWith(RobolectricTestRunner::class)
@GraphicsMode(GraphicsMode.Mode.NATIVE)
@Config(
    sdk = [34],
    qualifiers = "ar-rSA-ldrtl-w393dp-h852dp-440dpi",
    application = android.app.Application::class
)
class NotesScreenVisualTest {
    @get:Rule val compose = createComposeRule()

    private val note =
        NoteRow(
            clientId = "e2e00000-0000-4000-8000-00000000e162",
            id = "e2e00000-0000-4000-8000-00000000e162",
            body = "ملاحظة قياس\n\nنص القياس على الشاشتين.",
            createdAt = Instant.now().toString(),
            updatedAt = Instant.now().toString(),
            deletedAt = null,
        )

    private fun compose(state: NotesUiState, selected: NoteRow?) {
        compose.setContent {
            RoyaraqamiaTheme {
                CompositionLocalProvider(LocalLayoutDirection provides LayoutDirection.Rtl) {
                    Box(Modifier.width(393.dp).fillMaxHeight()) {
                        NotesSurface(
                            state = state,
                            pill = null,
                            query = "",
                            selected = selected,
                            onQueryChange = {},
                            onOpen = {},
                            onCreate = {},
                            onBack = {},
                            onSave = {},
                            onDelete = {},
                            editorEditable = false,
                        )
                    }
                }
            }
        }
    }

    private fun top(tag: String) =
        compose.onNodeWithTag(tag, useUnmergedTree = true).getUnclippedBoundsInRoot().top.value

    private fun width(tag: String): Float {
        val box = compose.onNodeWithTag(tag, useUnmergedTree = true).getUnclippedBoundsInRoot()
        return (box.right - box.left).value
    }

    private fun height(tag: String): Float {
        val box = compose.onNodeWithTag(tag, useUnmergedTree = true).getUnclippedBoundsInRoot()
        return (box.bottom - box.top).value
    }

    private fun record(state: String, capture: String, elements: String) {
        val json = JSONObject("""{"surface":"notes","elements":{$elements}}""").toString(2)
        val dir = File("../../e2e/__visual__/notes/$state").apply { mkdirs() }
        File(dir, "app.json").writeText("$json\n")
        compose
            .onNodeWithTag(capture, useUnmergedTree = true)
            .captureRoboImage(File(dir, "app.png").path)
    }

    private fun title() =
        """
        "title": {
          "top": ${top(NotesMetrics.TITLE)},
          "height": ${height(NotesMetrics.TITLE)},
          "fontSize": ${NotesMetrics.titleSize.value},
          "fontWeight": ${NotesMetrics.titleWeight.weight}
        }
        """

    @Test
    fun `the empty list records the page's card and empty block`() {
        compose(NotesUiState.Empty, null)

        record(
            state = "at-rest",
            capture = NotesMetrics.EMPTY,
            elements =
                """
                ${title()},
                "list": {
                  "top": ${top(NotesMetrics.LIST)},
                  "width": ${width(NotesMetrics.LIST)},
                  "radius": ${NotesMetrics.listRadius.value}
                },
                "search": {
                  "height": ${height(NotesMetrics.SEARCH)},
                  "fontSize": ${NotesMetrics.searchSize.value},
                  "radius": ${NotesMetrics.searchRadius.value}
                },
                "empty": {
                  "top": ${top(NotesMetrics.EMPTY)},
                  "width": ${width(NotesMetrics.EMPTY)},
                  "paddingTop": ${NotesMetrics.emptyPadding.value}
                },
                "empty-title": {
                  "top": ${top(NotesMetrics.EMPTY_TITLE)},
                  "height": ${height(NotesMetrics.EMPTY_TITLE)},
                  "fontSize": ${NotesMetrics.emptyTitleSize.value},
                  "fontWeight": ${NotesMetrics.emptyTitleWeight.weight}
                },
                "empty-body": {
                  "top": ${top(NotesMetrics.EMPTY_BODY)},
                  "width": ${width(NotesMetrics.EMPTY_BODY)},
                  "fontSize": ${NotesMetrics.emptyBodySize.value},
                  "lineHeight": ${NotesMetrics.emptyBodyLineHeight.value}
                }
                """,
        )
    }

    @Test
    fun `the open note records the page's editor shell`() {
        compose(NotesUiState.Painted(listOf(note)), note)

        record(
            state = "open-note",
            capture = NotesMetrics.EDITOR,
            elements =
                """
                "editor": {
                  "top": ${top(NotesMetrics.EDITOR)},
                  "width": ${width(NotesMetrics.EDITOR)}
                },
                "editor-body": {
                  "top": ${top(NotesMetrics.EDITOR_BODY)},
                  "width": ${width(NotesMetrics.EDITOR_BODY)},
                  "radius": ${NotesMetrics.editorBodyRadius.value}
                }
                """,
        )
    }
}
