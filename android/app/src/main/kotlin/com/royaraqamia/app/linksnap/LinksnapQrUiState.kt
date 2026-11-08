package com.royaraqamia.app.linksnap

import com.google.zxing.common.BitMatrix

/**
 * What the QR dialog is showing (#943).
 *
 * The page imports its encoder lazily, so its dialog has three faces: the wait
 * before the module arrives, the code, and the refusal. The app encodes from a
 * local library, but it keeps the same three faces rather than pretending the
 * work is instant: [Loading] is the frame before the encoder answers, and
 * [Failed] is a matrix the encoder refused instead of a blank square.
 */
sealed interface LinksnapQrUiState {
    data object Loading : LinksnapQrUiState
    data object Failed : LinksnapQrUiState
    data class Ready(val matrix: BitMatrix) : LinksnapQrUiState
}
