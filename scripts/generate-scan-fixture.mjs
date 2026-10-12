import QRCode from 'qrcode';
import { writeFileSync } from 'node:fs';

const payload = 'royaraqamia.com/scan-fixture';
const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
const size = qr.modules.size;
const rows = [];
for (let y = 0; y < size; y += 1) {
  let row = '';
  for (let x = 0; x < size; x += 1) row += qr.modules.data[y * size + x] ? '1' : '0';
  rows.push(`  '${row}',`);
}

const file = `// A symbol the Scanner knows the answer to, so a detector can be asked to prove
// itself before it is handed a camera (ADR-0035). Generated once with
// \`QRCode.create('${payload}', { errorCorrectionLevel: 'M' })\` — a ${size}x${size}
// matrix, one character per module, \`1\` for a dark module.
//
// Regenerate with \`node scripts/generate-scan-fixture.mjs\`; the payload must
// stay in step with the matrix, and the unit tests decode both.

/** What the fixture symbol says. */
export const SCAN_FIXTURE_PAYLOAD = '${payload}';

/** The fixture symbol's modules, row by row. */
export const SCAN_FIXTURE_MODULES: readonly string[] = [
${rows.join('\n')}
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
`;

writeFileSync(process.argv[2], file);
console.log(`modules ${size}x${size}, payload ${payload}`);
