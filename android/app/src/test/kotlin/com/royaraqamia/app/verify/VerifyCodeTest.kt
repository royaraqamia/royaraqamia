package com.royaraqamia.app.verify

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

/** The field's two judgements, from the site's own pattern (`CERT_CODE_REGEX`, #658). */
class VerifyCodeTest {
    @Test
    fun `a whole code is well formed`() {
        assertTrue(VerifyCode.isValidFormat("COMP-2026-UHVW9SG5"))
        assertTrue(
            "a pasted lower-case code is the same code",
            VerifyCode.isValidFormat("comp-2026-uhvw9sg5"),
        )
    }

    @Test
    fun `a partial code is not well formed`() {
        assertFalse(VerifyCode.isValidFormat("COMP-2026"))
        assertFalse(VerifyCode.isValidFormat("COMP-26-UHVW9SG5"))
        assertFalse(VerifyCode.isValidFormat("COMP-2026-UHVW9SG"))
    }

    @Test
    fun `the format sentence waits until there is enough to judge`() {
        assertFalse("four characters say nothing yet", VerifyCode.isSuspicious("COMP"))
        assertTrue(VerifyCode.isSuspicious("COMP-2"))
        assertFalse("a whole code is not suspicious", VerifyCode.isSuspicious("COMP-2026-UHVW9SG5"))
    }
}
