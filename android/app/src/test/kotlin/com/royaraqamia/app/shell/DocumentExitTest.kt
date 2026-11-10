package com.royaraqamia.app.shell

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * Which document result closes the app (#1246).
 *
 * The document is launched for result, and the system reports *every* way it goes
 * away as `RESULT_CANCELED` — a deep link rebasing the shell's task, the update
 * card's `CLEAR_TOP`, a restored task after a process death. Only the document's
 * own back out of the site's root (ADR-0082) carries a code of its own, and that is
 * the whole of the decision this file covers.
 *
 * The numbers are spelled out rather than taken from `android.app.Activity`: they
 * are the contract with the platform, and a test that read them from the same jar
 * the code reads them from would not be checking the contract.
 */
class DocumentExitTest {

    /** `Activity.RESULT_CANCELED`: what a destroyed document delivers. */
    private val canceled = 0

    /** `Activity.RESULT_OK`: the code any other caller of the document could send. */
    private val ok = -1

    @Test
    fun `the document's own root back closes the app`() {
        assertTrue(DocumentExit.leavesTheApp(DocumentExit.LEAVES_THE_APP))
    }

    @Test
    fun `a document the system destroyed leaves the frame in front`() {
        assertFalse(DocumentExit.leavesTheApp(canceled))
    }

    @Test
    fun `a result the shell did not ask for leaves the frame in front`() {
        assertFalse(DocumentExit.leavesTheApp(ok))
    }

    @Test
    fun `an unknown code leaves the frame in front`() {
        assertFalse(DocumentExit.leavesTheApp(DocumentExit.LEAVES_THE_APP + 1))
        assertFalse(DocumentExit.leavesTheApp(Int.MIN_VALUE))
    }

    @Test
    fun `the exit code is not one the platform assigns`() {
        // `RESULT_FIRST_USER` is 1 and up; anything below it is the platform's own,
        // so the shell's code must sit in the range only this app produces.
        assertTrue(DocumentExit.LEAVES_THE_APP >= 1)
        assertTrue(DocumentExit.LEAVES_THE_APP != ok)
        assertTrue(DocumentExit.LEAVES_THE_APP != canceled)
    }
}
