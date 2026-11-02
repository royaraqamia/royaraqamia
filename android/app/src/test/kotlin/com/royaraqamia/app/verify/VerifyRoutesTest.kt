package com.royaraqamia.app.verify

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The certificate link a stranger scans (#658).
 *
 * The code is the route's own segment, and it can arrive in the forms a printed
 * link and a browser produce: a trailing slash, a percent-encoded Arabic handle, a
 * lower-case paste, a query string. Reading it the way the site does — decoded,
 * trimmed, upper-cased — is what makes the screen look up the certificate the link
 * names rather than a different string.
 */
class VerifyRoutesTest {
    @Test
    fun `a plain link carries its code`() {
        assertEquals("COMP-2026-UHVW9SG5", VerifyRoutes.codeOf("/verify/COMP-2026-UHVW9SG5"))
    }

    @Test
    fun `a lower-case code is the same code`() {
        assertEquals("COMP-2026-UHVW9SG5", VerifyRoutes.codeOf("/verify/comp-2026-uhvw9sg5"))
    }

    @Test
    fun `a trailing slash and a query do not change the code`() {
        assertEquals("COMP-2026-UHVW9SG5", VerifyRoutes.codeOf("/verify/COMP-2026-UHVW9SG5/"))
        assertEquals(
            "the route's query is not part of the code",
            "COMP-2026-UHVW9SG5",
            VerifyRoutes.codeOf("/verify/COMP-2026-UHVW9SG5?from=qr"),
        )
    }

    @Test
    fun `the page without a code is not a certificate link`() {
        assertNull(VerifyRoutes.codeOf("/verify"))
        assertNull(VerifyRoutes.codeOf("/verify/"))
        assertNull(VerifyRoutes.codeOf("/verify/a/b"))
        assertNull(VerifyRoutes.codeOf("/rates"))
        assertFalse(VerifyRoutes.matches("/verify"))
        assertTrue(VerifyRoutes.matches("/verify/COMP-2026-UHVW9SG5"))
    }
}
