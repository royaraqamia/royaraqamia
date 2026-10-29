package com.royaraqamia.app.contracts

import com.royaraqamia.app.contracts.generated.MyUsageResponse
import com.royaraqamia.app.contracts.generated.MyUsageResponseStatePlan
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The decode path a screen depends on (#648): a body that matches the contract
 * becomes a generated type, and a body that does not becomes a value the screen
 * can render instead of an exception on a background thread.
 */
class ContractCodecTest {
    private val body = """
        {
          "success": true,
          "state": {
            "plan": "free",
            "unlimited": false,
            "expiresAt": null,
            "counters": [
              {
                "key": "scanner.scan",
                "label": "عمليات المسح",
                "window": "daily",
                "cap": 3,
                "used": 1,
                "remaining": 2
              }
            ]
          }
        }
    """.trimIndent()

    @Test
    fun `a matching body decodes through the generated type`() {
        val result = ContractCodec.decode<MyUsageResponse>(body)

        val response = (result as ApiResult.Success).value
        assertEquals(MyUsageResponseStatePlan.FREE, response.state.plan)
        assertEquals(false, response.state.unlimited)
        assertEquals(null, response.state.expiresAt)
        assertEquals("scanner.scan", response.state.counters.single().key)
        assertEquals(2L, response.state.counters.single().remaining)
    }

    @Test
    fun `a field the contract does not know is ignored`() {
        // Adding an optional field to a Zod schema must not break an app that
        // shipped before the field existed.
        val withExtra = body.replaceFirst("\"unlimited\": false,", "\"unlimited\": false, \"bonus\": 7,")

        assertTrue(ContractCodec.decode<MyUsageResponse>(withExtra) is ApiResult.Success)
    }

    @Test
    fun `a missing required field is a typed failure naming the field`() {
        val missing = body.replaceFirst("\"plan\": \"free\",", "")

        val failure = ContractCodec.decode<MyUsageResponse>(missing) as ApiResult.Failure
        val error = failure.error as ApiError.InvalidContract
        assertEquals("plan", error.field)
    }

    @Test
    fun `a value outside the contract is a typed failure`() {
        val wrongPlan = body.replaceFirst("\"plan\": \"free\"", "\"plan\": \"gold\"")

        val failure = ContractCodec.decode<MyUsageResponse>(wrongPlan) as ApiResult.Failure
        assertTrue(failure.error is ApiError.InvalidContract)
    }

    @Test
    fun `a body that is not json is a typed failure`() {
        assertTrue(ContractCodec.decode<MyUsageResponse>("<html>502</html>") is ApiResult.Failure)
    }
}
