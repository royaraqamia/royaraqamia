/**
 * One set of image limits for the upload paths and both decode paths.
 *
 * A byte cap says nothing about pixels: a flat-colour PNG under 200 KB can be
 * 64 MP, which libvips materialises as 244 MiB before it can resize. The
 * ceiling below is the number the origin is willing to decode in a process
 * whose whole container is 512 MiB (#1787). `next.config.js` reads
 * `IMAGE_MAX_PIXELS` out of this file so the optimizer and the uploads cannot
 * disagree about it.
 */

/** Longest edge of an image stored after an accepted upload. */
export const IMAGE_MAX_EDGE_PX = 2400;

/** Quality of the re-encoded copy, on sharp's 1-100 scale. */
export const IMAGE_ENCODE_QUALITY = 80;

/** Bytes the delivery optimizer will download from a source before decoding it. */
export const IMAGE_SOURCE_MAX_BYTES = 5 * 1024 * 1024;

/**
 * Pixels one image may occupy when it is decoded. 12 MP is 48 MiB of RGBA,
 * inside the headroom above the origin's measured p95, and far below sharp's
 * default of 268,402,689 px (about 1 GiB of RGBA).
 */
export const IMAGE_MAX_PIXELS = 12_000_000;

/** The one sentence both upload paths answer when an image has too many pixels. */
export const IMAGE_PIXEL_REFUSAL = 'أبعاد الصُّورة كبيرة جدًّا، اختر صورة أصغر';
