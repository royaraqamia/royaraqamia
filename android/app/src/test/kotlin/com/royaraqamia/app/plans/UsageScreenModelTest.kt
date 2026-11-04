package com.royaraqamia.app.plans

import com.royaraqamia.app.contracts.ApiResult
import com.royaraqamia.app.contracts.ContractCodec
import com.royaraqamia.app.contracts.generated.MyPlanResponse
import org.junit.Assert.assertEquals
import org.junit.Test

/** The plan card's model, from the endpoint's own body (#648, ADR-0098). */
class UsageScreenModelTest {
    private val body =
        """
        {
          "success": true,
          "state": {
            "plan": "pro",
            "unlimited": false,
            "expiresAt": "2027-01-31T00:00:00.000Z",
            "counters": [
              {
                "key": "quran.surah.read",
                "label": "surah read",
                "window": "lifetime",
                "cap": 10,
                "used": 4,
                "remaining": 6
              }
            ]
          },
          "limits": [
            { "key": "notes", "label": "notes", "cap": 5, "used": 1, "remaining": 4 }
          ],
          "activations": [
            {
              "id": "3f1e7c2a-8b93-4c1e-9a55-2f2c4f0d1a77",
              "plan": "pro",
              "amountCents": 1200,
              "currency": "USD",
              "method": "shamcash",
              "note": null,
              "activatedAt": "2026-10-21T12:00:00.000Z",
              "expiresAt": "2026-11-21T12:00:00.000Z"
            }
          ]
        }
        """.trimIndent()

    private val model =
        UsageScreenModel.from((ContractCodec.decode<MyPlanResponse>(body) as ApiResult.Success).value)

    @Test
    fun `the state maps to the rows the card draws`() {
        assertEquals("pro", model.plan)
        assertEquals(false, model.unlimited)
        assertEquals("2027-01-31T00:00:00.000Z", model.expiresAt)
    }

    @Test
    fun `the bar counts the standing owned-item caps, not the counted actions`() {
        // The site's `usageShare` sums the same `limits` body (ADR-0098): a daily
        // count is a number of times that resets, and folding it into a standing
        // total would make the bar drop at midnight on its own.
        assertEquals(1L, model.used)
        assertEquals(5L, model.cap)
        assertEquals(20, model.share)
    }

    @Test
    fun `a plan with no caps reads as empty rather than dividing by zero`() {
        val empty =
            UsageScreenModel.from(
                (
                    ContractCodec.decode<MyPlanResponse>(
                        body.replace(
                            """{ "key": "notes", "label": "notes", "cap": 5, "used": 1, "remaining": 4 }""",
                            "",
                        )
                    ) as ApiResult.Success
                ).value
            )

        assertEquals(0, empty.share)
    }

    @Test
    fun `the history maps every payment the page lists`() {
        val activation = model.activations.single()

        assertEquals("3f1e7c2a-8b93-4c1e-9a55-2f2c4f0d1a77", activation.id)
        assertEquals(1200L, activation.amountCents)
        assertEquals("USD", activation.currency)
        assertEquals("shamcash", activation.method)
        assertEquals(null, activation.note)
        assertEquals("2026-10-21T12:00:00.000Z", activation.activatedAt)
        assertEquals("2026-11-21T12:00:00.000Z", activation.expiresAt)
    }

    @Test
    fun `a note arrives as it was written`() {
        val withNote = body.replace("\"note\": null", "\"note\": \"تحويل يدوي\"")

        val parsed = UsageScreenModel.from((ContractCodec.decode<MyPlanResponse>(withNote) as ApiResult.Success).value)

        assertEquals("تحويل يدوي", parsed.activations.single().note)
    }
}
