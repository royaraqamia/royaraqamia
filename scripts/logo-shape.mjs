import sharp from 'sharp';

/**
 * The logo's shape, measured rather than assumed, so every surface can be held
 * to the same numbers.
 *
 * `public/logo.webp` is a purple tile carrying a white disc at 60% of its width,
 * and `scripts/generate-icons.mjs` insets that artwork to 86% of the tile, which
 * puts the disc at ~52% of whatever the user sees: the tile on a launcher, the
 * disc on a splash. That ~52% is the contract, and it went unenforced once —
 * `scripts/generate-android-assets.mjs` insets the artwork to Android's 72dp
 * safe zone on top of the 86%, so the installed app showed the disc at 34% of
 * its circle beside the PWA's 52%: one logo, reading as a thicker purple ring.
 *
 * Both measurements come off the middle row, which crosses the disc, the purple
 * diamond inside it and the tile around it — so they work on any image that puts
 * the tile on a plainer backdrop (a launcher canvas, a splash frame).
 */

/** A pixel is part of the disc above this value on all three channels. */
export const WHITE_THRESHOLD = 200;
/** How far a generated disc may sit from the master's proportion, in pixels. */
export const DISC_TOLERANCE_PX = 2;

/**
 * The white disc's share of the purple shape on the app's own surfaces — the
 * middle the owner picked after being shown the two extremes on the emulator
 * (76% and 52%). The PWA's own icon set is not on this number: it is the
 * artwork's 51.7%, and it is also what the launcher magnifies (see
 * `LAUNCHER_MAGNIFICATION`), so its installed icon reads differently by launcher
 * class. The app's surfaces each reach this target their own way, because only
 * the launcher transforms anything.
 */
export const TARGET_DISC_RATIO = 0.64;

/**
 * The artwork scale that puts the disc at `TARGET_DISC_RATIO` of a surface's
 * logo box. `sourceRatio` is the artwork's own disc proportion; scaling the
 * artwork past 1 crops its purple edges, which are the background colour.
 */
export function artworkScaleFor(sourceRatio) {
  return TARGET_DISC_RATIO / sourceRatio;
}

/** The artwork's disc as a share of its own width, measured, not assumed. */
export async function artworkDiscRatio(file, purple) {
  const artwork = await measure(file, purple);
  return artwork.disc / artwork.tile;
}

export function isDiscPixel({ r, g, b, a }) {
  return r > WHITE_THRESHOLD && g > WHITE_THRESHOLD && b > WHITE_THRESHOLD && a > 128;
}

export function isTilePixel({ r, g, b, a }, purple) {
  return (
    a > 128 &&
    Math.abs(r - purple.r) <= 24 &&
    Math.abs(g - purple.g) <= 24 &&
    Math.abs(b - purple.b) <= 24
  );
}

/** The pixels of `file`, with a per-pixel accessor. */
export async function readPixels(file) {
  const { data, info } = await sharp(file)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    width: info.width,
    height: info.height,
    at(x, y) {
      const i = (y * info.width + x) * info.channels;
      return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
    },
  };
}

/**
 * Extent, in pixels, of everything on `image`'s middle row that `matches`
 * accepts: from the first matching pixel to the last.
 *
 * The row crosses the disc's purple diamond and its dot, so the disc reads as
 * several runs rather than one; the extent spans it either way, just as it spans
 * the tile the disc sits in.
 */
export function rowExtent(image, matches) {
  const y = Math.floor(image.height / 2);
  let first = -1;
  let last = -1;
  for (let x = 0; x < image.width; x++) {
    if (!matches(image.at(x, y))) continue;
    if (first < 0) first = x;
    last = x;
  }
  return first < 0 ? 0 : last - first + 1;
}

/** The disc and the tile it sits in, as extents on the middle row. */
export async function measure(file, purple) {
  const image = await readPixels(file);
  return {
    image,
    disc: rowExtent(image, isDiscPixel),
    tile: rowExtent(image, (pixel) => isTilePixel(pixel, purple)),
  };
}
