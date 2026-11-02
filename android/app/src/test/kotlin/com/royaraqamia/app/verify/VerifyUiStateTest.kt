package com.royaraqamia.app.verify

import com.royaraqamia.app.contracts.ApiError
import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.generated.VerifyResult
import com.royaraqamia.app.contracts.generated.VerifyResultCertificate
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * One certificate check, as the six states the site's page draws (#658).
 *
 * The cases are the ones a server can answer, and the three that are easy to
 * collapse into one: no such code, an allowance already spent, and a request that
 * never left. A screen that showed the same card for all three would be telling a
 * visitor with no radio that their certificate does not exist.
 */
class VerifyUiStateTest {
    private val certificate =
        VerifyResultCertificate(
            id = "c-1",
            certificate_code = "COMP-2026-UHVW9SG5",
            student_name = "طالب",
            course_name = "دورة",
            issue_date = "2026-01-01",
            expiration_date = null,
            grade_or_status = null,
            created_at = "2026-01-01T00:00:00.000Z",
        )

    @Test
    fun `a hit is the certificate`() {
        val state =
            VerifyUiState.of(
                ApiResult.Success(VerifyResult(success = true, certificate = certificate))
            )

        assertEquals(VerifyUiState.Found(certificate), state)
    }

    @Test
    fun `success without a certificate is not a hit`() {
        val state = VerifyUiState.of(ApiResult.Success(VerifyResult(success = true)))

        assertEquals(VerifyUiState.NotFound(VerifyCopy.UNEXPECTED), state)
    }

    @Test
    fun `an unknown code keeps the server's own sentence`() {
        val state =
            VerifyUiState.of(
                ApiResult.Success(VerifyResult(success = false, error = "لا توجد شهادة بهذا الرَّمز"))
            )

        assertEquals(VerifyUiState.NotFound("لا توجد شهادة بهذا الرَّمز"), state)
    }

    @Test
    fun `a spent allowance is its own state, not an unknown code`() {
        val state =
            VerifyUiState.of(
                ApiResult.Success(
                    VerifyResult(success = false, rateLimited = true, error = "ابدأ بعد دقائق")
                )
            )

        assertEquals(VerifyUiState.RateLimited("ابدأ بعد دقائق"), state)
    }

    @Test
    fun `a spent allowance with no sentence still says so`() {
        val state = VerifyUiState.of(ApiResult.Success(VerifyResult(success = false, rateLimited = true)))

        assertEquals(VerifyUiState.RateLimited(VerifyCopy.RATE_LIMITED_BODY), state)
    }

    @Test
    fun `an unreachable server is a network state`() {
        val state = VerifyUiState.of(ApiResult.Failure(ApiError.Network("offline")))

        assertEquals(VerifyUiState.Unreachable, state)
    }

    @Test
    fun `a drifted body is the unexpected sentence rather than a crash`() {
        val state = VerifyUiState.of(ApiResult.Failure(ApiError.InvalidContract("success", "bad")))

        assertEquals(VerifyUiState.NotFound(VerifyCopy.UNEXPECTED), state)
    }
}
