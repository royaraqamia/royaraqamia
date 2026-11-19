package com.royaraqamia.app.profile

/**
 * The seeded look of a member's cover, as the page computes it (ADR-0201).
 *
 * The arithmetic is deliberately small enough to state twice: [seed] sums the
 * id's code points, [palette] takes it mod twelve and [shape] the next division
 * mod four. `shared/profile-cover.ts` is the other statement, and the two are
 * bound by the fixtures its Vitest suite and `ProfileCoverPalettesTest` assert.
 * A member's id and never their handle is the input, so a rename cannot repaint
 * a profile.
 */
object ProfileCoverLook {
    const val PALETTE_COUNT: Int = 12
    const val SHAPE_COUNT: Int = 4

    /** Where the two orbs sit, as logical fractions of the band. */
    val PLACEMENTS: List<Pair<Float, Float>> =
        listOf(
            0.18f to 0.00f,
            0.82f to 0.06f,
            0.40f to -0.06f,
            0.70f to -0.02f,
        )

    /** Code points, not UTF-16 units, so an Arabic id agrees with the page. */
    fun seed(id: String): Int = id.codePoints().sum()

    /** The palette index a member's id asks for, stable for the row's life. */
    fun palette(id: String): Int = seed(id) % PALETTE_COUNT

    /** The orb placement index, from the next higher division of the same seed. */
    fun shape(id: String): Int = (seed(id) / PALETTE_COUNT) % SHAPE_COUNT

    /** The logical orb position for an id, never mirrored by layout direction. */
    fun placement(id: String): Pair<Float, Float> = PLACEMENTS[shape(id)]
}
