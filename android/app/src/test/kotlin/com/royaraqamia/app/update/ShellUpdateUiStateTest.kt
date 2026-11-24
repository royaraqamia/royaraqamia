package com.royaraqamia.app.update

import com.royaraqamia.app.ShellUpdate
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The two questions the frame asks of an update answer (#652, ADR-0114), kept
 * pure so the back callback and the dialog's own properties cannot drift.
 *
 * The defect this covers was an offer that flashed and vanished: an offer did
 * not hold the frame, so `handOver()` opened the document over it. The answer is
 * to hold for every card, while still letting the cards that can be put off be
 * answered with back — a floor and a download in flight cannot.
 */
class ShellUpdateUiStateTest {

    private val status = ShellUpdate.idle(20021)

    private fun offer() = ShellUpdateCard.Offer(status)

    private fun required() = ShellUpdateCard.Required(status)

    private fun downloading() = ShellUpdateUiState.Downloading(offer(), 0, 100)

    private fun failed() = ShellUpdateUiState.Failed(offer(), ShellUpdateFailure.Download)

    @Test
    fun `idle is the only state that lets the document open`() {
        assertFalse(ShellUpdateUiState.Idle.holdsFrame)
        assertTrue(ShellUpdateUiState.Asking(offer()).holdsFrame)
        assertTrue(ShellUpdateUiState.Asking(required()).holdsFrame)
        assertTrue(downloading().holdsFrame)
        assertTrue(failed().holdsFrame)
    }

    @Test
    fun `a floor and a download cannot be dismissed but an offer can`() {
        assertTrue(ShellUpdateUiState.Asking(offer()).dismissable)
        assertFalse(ShellUpdateUiState.Asking(required()).dismissable)
        assertFalse(downloading().dismissable)
        assertTrue(failed().dismissable)
        assertFalse(ShellUpdateUiState.Idle.dismissable)
    }

    @Test
    fun `an offer holds the frame without losing its later answer`() {
        val asking = ShellUpdateUiState.Asking(offer())
        assertTrue(asking.holdsFrame)
        assertTrue(asking.dismissable)
    }
}
