package com.royaraqamia.app.update

import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * The typed `426` an owned API answers a build below the floor (#503, #652).
 *
 * What is checked is the reading, not the status: `shared/contracts/app-update.ts`
 * is the schema, and a body that is not that shape must be silence rather than a
 * number the app installs an APK on the strength of.
 */
class ShellUpdateRequiredTest {

    @Test
    fun `the typed body names the floor`() {
        val body =
            "{\"success\": false, \"error\": \"update required\", " +
                "\"code\": \"app_update_required\", \"minimumVersionCode\": 20042}"

        assertEquals(20042, ShellUpdateRequired.floorOf(body))
    }

    @Test
    fun `another refusal is not a floor`() {
        assertEquals(0, ShellUpdateRequired.floorOf("{\"code\": \"rate_limited\"}"))
        assertEquals(0, ShellUpdateRequired.floorOf("{\"error\": \"nope\"}"))
    }

    @Test
    fun `a floor written as a string is not a number`() {
        // The contract says a number; coercing a string here would accept a body
        // the site's own schema rejects.
        assertEquals(
            0,
            ShellUpdateRequired.floorOf("{\"code\": \"app_update_required\", \"minimumVersionCode\": \"20042\"}"),
        )
    }

    @Test
    fun `a missing or unusable floor is zero`() {
        assertEquals(0, ShellUpdateRequired.floorOf("{\"code\": \"app_update_required\"}"))
        assertEquals(
            0,
            ShellUpdateRequired.floorOf("{\"code\": \"app_update_required\", \"minimumVersionCode\": 0}"),
        )
        assertEquals(
            0,
            ShellUpdateRequired.floorOf("{\"code\": \"app_update_required\", \"minimumVersionCode\": -5}"),
        )
    }

    @Test
    fun `an unreadable body is zero rather than an exception`() {
        // The caller is a request that has already failed; an unreadable refusal
        // must not become a second failure.
        assertEquals(0, ShellUpdateRequired.floorOf(null))
        assertEquals(0, ShellUpdateRequired.floorOf(""))
        assertEquals(0, ShellUpdateRequired.floorOf("not json"))
        assertEquals(0, ShellUpdateRequired.floorOf("[]"))
    }
}
