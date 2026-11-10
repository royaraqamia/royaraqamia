package com.royaraqamia.app.shell

/**
 * Who closed the document, which is what the shell's result reads (#1246).
 *
 * The document is launched for result, and for a while *any* result meant "the user
 * backed out of the site's root", so the shell finished. That is right for exactly
 * one path — the press `MainActivity.installBackExit()` answers when the WebView has
 * nothing left to walk (ADR-0082) — and wrong for every other way the document can go
 * away, all of which the system reports as `RESULT_CANCELED`:
 *
 * - a deep link arriving while a page is open: the shell is `singleTask`, so the task
 *   is rebased, the document is destroyed, and its result reaches the shell;
 * - [ShellActivity.bringFrameForward] (`CLEAR_TOP|SINGLE_TOP`), which is how the
 *   update card draws over the document;
 * - a process death inside the request, then any relaunch that restores the task.
 *
 * So the result carries a decision rather than a fact. [LEAVES_THE_APP] is sent by
 * the one back path that genuinely leaves, and it is the only code the shell
 * finishes on; everything else leaves the frame in front, which is where the app
 * stays open and where the frame's own screens are reachable at all.
 */
object DocumentExit {
    /**
     * The result the document sends when the press that closed it was the root back.
     *
     * `RESULT_FIRST_USER` (1) rather than `RESULT_OK`: a document that finishes for
     * any reason at all is reported as `RESULT_CANCELED`, and `RESULT_OK` is a code
     * any other caller could plausibly send — the shell must only close on a value
     * that nothing but this path produces.
     */
    const val LEAVES_THE_APP = 1

    /**
     * `true` when the document's result says the app should close.
     *
     * Deliberately one comparison: an unknown code is a result this build does not
     * understand, and leaving the frame in front is the safe answer for it.
     */
    fun leavesTheApp(resultCode: Int): Boolean = resultCode == LEAVES_THE_APP
}
