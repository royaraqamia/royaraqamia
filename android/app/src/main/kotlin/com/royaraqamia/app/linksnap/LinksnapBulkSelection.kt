package com.royaraqamia.app.linksnap

import androidx.compose.runtime.Stable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.saveable.listSaver
import androidx.compose.runtime.setValue

/**
 * The owned list's bulk selection (#942).
 *
 * Selection is held by slug because that is what the page's bar counts and what
 * the bulk route takes, and it lives above the list so a scroll does not rebuild
 * it. The [Saver] is what makes it survive a rotation: the screen keeps one of
 * these in `rememberSaveable`, so the count and the ticked rows come back with
 * the activity instead of resetting to none.
 *
 * It is a plain state holder rather than a reducer because every transition is a
 * set operation on one set: toggle, toggle-all, clear, and drop the codes a pull
 * no longer shows.
 */
@Stable
internal class LinksnapBulkSelection(initial: Set<String> = emptySet()) {
    var codes by mutableStateOf(initial)
        private set

    val count: Int
        get() = codes.size

    /** Whether every visible row is selected, which is what "select all" shows. */
    fun allSelected(visible: Collection<String>): Boolean =
        visible.isNotEmpty() && visible.all(codes::contains)

    fun toggle(code: String) {
        codes = if (code in codes) codes - code else codes + code
    }

    /** Select every visible code, or clear when they are already all selected. */
    fun toggleAll(visible: Collection<String>) {
        codes =
            if (visible.isNotEmpty() && visible.all(codes::contains)) emptySet()
            else visible.toSet()
    }

    fun clear() {
        codes = emptySet()
    }

    /** Drops a code a pull or a drain no longer shows, so the count cannot exceed the list. */
    fun retain(visible: Collection<String>) {
        val kept = visible.toSet()
        if (kept.containsAll(codes)) return
        codes = codes.intersect(kept)
    }

    companion object {
        /** The one state a rotation has to keep: the ticked slugs. */
        val Saver =
            listSaver<LinksnapBulkSelection, String>(
                save = { it.codes.toList() },
                restore = { LinksnapBulkSelection(it.toSet()) },
            )
    }
}
