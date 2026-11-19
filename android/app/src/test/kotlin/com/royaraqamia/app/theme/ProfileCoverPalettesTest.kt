package com.royaraqamia.app.theme

import com.royaraqamia.app.profile.ProfileCoverLook
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

/**
 * The app's half of the cover's fixture list (ADR-0201).
 *
 * These are the five ids `shared/profile-cover.ts` names in `COVER_FIXTURES`.
 * The two clients compute the same index from the same code points; if either
 * side changes, this test or the Vitest suite fails before a member is painted
 * differently on a phone and on the site.
 */
class ProfileCoverPalettesTest {
    private data class Fixture(val id: String, val palette: Int, val shape: Int)

    // Mirrors COVER_FIXTURES in shared/profile-cover.ts. Keep the two in step.
    private val fixtures =
        listOf(
            Fixture("a1b2c3d4-1111-4aaa-9bbb-000000000001", 11, 2),
            Fixture("b2c3d4e5-2222-4bbb-8ccc-000000000002", 5, 0),
            Fixture("c3d4e5f6-3333-4ccc-9ddd-000000000003", 1, 2),
            Fixture("d4e5f6a7-4444-4ddd-8eee-000000000004", 1, 3),
            Fixture("00000000-0000-4000-8000-000000000000", 0, 0),
        )

    @Test
    fun `every shared fixture picks the same palette and shape`() {
        for (fixture in fixtures) {
            assertEquals("${fixture.id}: palette", fixture.palette, ProfileCoverLook.palette(fixture.id))
            assertEquals("${fixture.id}: shape", fixture.shape, ProfileCoverLook.shape(fixture.id))
        }
    }

    @Test
    fun `every picked palette has a generated pair`() {
        assertEquals(ProfileCoverLook.PALETTE_COUNT, ProfileCoverPalettes.PAIRS.size)
        for (fixture in fixtures) {
            val index = ProfileCoverLook.palette(fixture.id)
            assertTrue("${fixture.id}: palette $index is outside the tokens", index in ProfileCoverPalettes.PAIRS.indices)
        }
    }

    @Test
    fun `the four placements are logical and never mirror`() {
        assertEquals(ProfileCoverLook.SHAPE_COUNT, ProfileCoverLook.PLACEMENTS.size)
        assertEquals(
            listOf(0.18f to 0.00f, 0.82f to 0.06f, 0.40f to -0.06f, 0.70f to -0.02f),
            ProfileCoverLook.PLACEMENTS,
        )
        for (fixture in fixtures) {
            assertEquals(
                "${fixture.id}: placement",
                ProfileCoverLook.PLACEMENTS[fixture.shape],
                ProfileCoverLook.placement(fixture.id),
            )
        }
    }

    @Test
    fun `the seed counts code points, not UTF-16 units`() {
        assertEquals(0x0635, ProfileCoverLook.seed("ص"))
        assertEquals(0x61, ProfileCoverLook.seed("a"))
    }

    @Test
    fun `an id keeps its look when asked twice`() {
        val id = fixtures.first().id
        assertEquals(ProfileCoverLook.palette(id), ProfileCoverLook.palette(id))
        assertEquals(ProfileCoverLook.shape(id), ProfileCoverLook.shape(id))
    }
}
