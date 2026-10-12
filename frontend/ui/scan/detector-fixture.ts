// A symbol the Scanner knows the answer to, so a detector can be asked to prove
// itself before it is handed a camera (ADR-0035). Generated once with
// `QRCode.create('royaraqamia.com/scan-fixture', { errorCorrectionLevel: 'M' })` — a 29x29
// matrix, one character per module, `1` for a dark module.
//
// Regenerate with `node scripts/generate-scan-fixture.mjs`; the payload must
// stay in step with the matrix, and the unit tests decode both.

/** What the fixture symbol says. */
export const SCAN_FIXTURE_PAYLOAD = 'royaraqamia.com/scan-fixture';

/** The fixture symbol's modules, row by row. */
export const SCAN_FIXTURE_MODULES: readonly string[] = [
  '11111110111111110111101111111',
  '10000010111111001100101000001',
  '10111010000110001010101011101',
  '10111010111110110100001011101',
  '10111010001000101011001011101',
  '10000010000011011001101000001',
  '11111110101010101010101111111',
  '00000000100110011100000000000',
  '10110111001001010110001001011',
  '01001001110001110001011110011',
  '01001010110001001110100111110',
  '11011001001100001000110110011',
  '10010011010110110101000001111',
  '11011101000110101111001100111',
  '11011010010111011011110101111',
  '11100100100000101000001011001',
  '00111111100000111010110110011',
  '00100101110000101010100101000',
  '10110111100111111110101111000',
  '00110100000001100101110111101',
  '01010010110011101111111110101',
  '00000000100010011010100010001',
  '11111110111100110111101011110',
  '10000010101101110010100010001',
  '10111010001000001010111110101',
  '10111010111001000001000110110',
  '10111010110111100111000100001',
  '10000010001010110111101111010',
  '11111110111000000111111010010',
];

/** How many screen pixels one fixture module is drawn at. */
const FIXTURE_MODULE_PIXELS = 6;

/** The quiet zone a barcode needs around it, in modules. */
const FIXTURE_QUIET_MODULES = 4;

/**
 * The fixture symbol as pixels, ready to hand to a detector. A detector that
 * cannot read this one cannot read anything, whatever it claims about itself.
 */
export function scanFixtureFrame(): ImageData {
  const rows = SCAN_FIXTURE_MODULES.length;
  const side = (rows + FIXTURE_QUIET_MODULES * 2) * FIXTURE_MODULE_PIXELS;
  const frame = new ImageData(side, side);
  const pixels = frame.data;
  pixels.fill(255);

  for (let row = 0; row < rows; row += 1) {
    const modules = SCAN_FIXTURE_MODULES[row];
    if (!modules) continue;
    for (let column = 0; column < modules.length; column += 1) {
      if (modules[column] !== '1') continue;
      const left = (column + FIXTURE_QUIET_MODULES) * FIXTURE_MODULE_PIXELS;
      const top = (row + FIXTURE_QUIET_MODULES) * FIXTURE_MODULE_PIXELS;
      for (let y = top; y < top + FIXTURE_MODULE_PIXELS; y += 1) {
        let offset = (y * side + left) * 4;
        for (let x = 0; x < FIXTURE_MODULE_PIXELS; x += 1) {
          pixels[offset] = 0;
          pixels[offset + 1] = 0;
          pixels[offset + 2] = 0;
          pixels[offset + 3] = 255;
          offset += 4;
        }
      }
    }
  }

  return frame;
}
