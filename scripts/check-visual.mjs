#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inflateSync } from 'node:zlib';

/**
 * The visual gate: a native screen is switched on only when it has been measured
 * against the page it replaces (#874, ADR-0118).
 *
 * A port is "the same screen" when two measurements agree:
 *
 * 1. **The layout contract** - every named element's box and the properties that
 *    make it what it is (radius, padding, gap, type size, colour), recorded from
 *    the page at the app's viewport and from the composed screen. This is the half
 *    that says *which* element moved and by how much: a services sheet that fills
 *    the screen instead of stopping at 85dvh fails here by name and number.
 * 2. **The raster** - the two captures diffed pixel for pixel, within a tolerance
 *    the surface declares. Glyph rasterisation, `backdrop-filter` glass, CSS
 *    shadows and subpixel antialiasing differ between Chromium and Skia even with
 *    the same fonts and tokens, so this can never be zero; it catches what a box
 *    cannot express.
 *
 * The files are the evidence, and this script refuses a port that has none:
 *
 *   docs/mobile/visual-gate.json          the surfaces under the gate
 *   shared/visual/<surface>.json          the contract: elements and properties
 *   e2e/__visual__/<surface>/web.json     the page's measurements
 *   e2e/__visual__/<surface>/app.json     the composed screen's measurements
 *   e2e/__visual__/<surface>/web.png      the page at the app's viewport
 *   e2e/__visual__/<surface>/app.png      the composed screen
 *
 * `docs/mobile/screens.json` decides what is switched on (`enabled`); this decides
 * whether it may be.
 */

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GATE = join(ROOT, 'docs', 'mobile', 'visual-gate.json');
const SCREENS = join(ROOT, 'docs', 'mobile', 'screens.json');
const EVIDENCE = join(ROOT, 'e2e', '__visual__');

/** A pixel differs when a channel moves by more than this, which absorbs dithering. */
const CHANNEL_TOLERANCE = 8;

/** How far a length may drift and still be the same box, in CSS pixels. */
const DEFAULT_LENGTH_TOLERANCE = 0.5;

/** The properties a contract may ask for. Anything else is a typo, not a measurement. */
export const PROPERTIES = new Set([
  'left',
  'top',
  'width',
  'height',
  'radius',
  'paddingTop',
  'paddingRight',
  'paddingBottom',
  'paddingLeft',
  'rowGap',
  'columnGap',
  'fontSize',
  'fontWeight',
  'lineHeight',
  'letterSpacing',
  'color',
  'backgroundColor',
  'borderTopWidth',
  'opacity',
  'maxHeight',
  'minHeight',
]);

/**
 * Reads a PNG into `{ width, height, data }`, where data is RGBA per pixel.
 *
 * Deliberately small: the two captures are Chromium and Robolectric screenshots,
 * which are 8-bit, non-interlaced, and RGB or RGBA. A decoder that guessed more
 * would be a renderer, and a renderer that disagrees with either client is worse
 * than no check.
 */
export function decodePng(buffer) {
  if (buffer.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') {
    throw new Error('not a PNG');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let depth = 0;
  let colorType = 0;
  let interlace = 0;
  const idat = [];

  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString('ascii');
    const body = buffer.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;

    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colorType = body[9];
      interlace = body[12];
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') {
      break;
    }
  }

  if (depth !== 8) throw new Error(`only 8-bit PNGs: this one is ${depth}-bit`);
  if (interlace !== 0) throw new Error('interlaced PNGs are not read');
  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error(`colour type ${colorType} is not one this reads`);

  const stride = width * channels;
  const raw = inflateSync(Buffer.concat(idat));
  const out = Buffer.alloc(width * height * 4);
  let previous = Buffer.alloc(stride);
  let cursor = 0;

  for (let y = 0; y < height; y += 1) {
    const filter = raw[cursor];
    cursor += 1;
    const line = Buffer.from(raw.subarray(cursor, cursor + stride));
    cursor += stride;
    unfilter(filter, line, previous, channels);

    for (let x = 0; x < width; x += 1) {
      const from = x * channels;
      const to = (y * width + x) * 4;
      out[to] = line[from];
      out[to + 1] = channels >= 3 ? line[from + 1] : line[from];
      out[to + 2] = channels >= 3 ? line[from + 2] : line[from];
      out[to + 3] = channels === 4 ? line[from + 3] : channels === 2 ? line[from + 1] : 255;
    }
    previous = line;
  }

  return { width, height, data: out };
}

/** Undoes one PNG scanline filter; `line` is mutated into the real samples. */
function unfilter(filter, line, previous, channels) {
  for (let i = 0; i < line.length; i += 1) {
    const left = i >= channels ? line[i - channels] : 0;
    const up = previous[i];
    const upLeft = i >= channels ? previous[i - channels] : 0;
    switch (filter) {
      case 0:
        break;
      case 1:
        line[i] = (line[i] + left) & 0xff;
        break;
      case 2:
        line[i] = (line[i] + up) & 0xff;
        break;
      case 3:
        line[i] = (line[i] + ((left + up) >> 1)) & 0xff;
        break;
      case 4: {
        const p = left + up - upLeft;
        const pa = Math.abs(p - left);
        const pb = Math.abs(p - up);
        const pc = Math.abs(p - upLeft);
        const predictor = pa <= pb && pa <= pc ? left : pb <= pc ? up : upLeft;
        line[i] = (line[i] + predictor) & 0xff;
        break;
      }
      default:
        throw new Error(`unknown PNG filter ${filter}`);
    }
  }
}

/** The share of pixels that differ, as a number from 0 to 1. */
export function pixelDifference(a, b, { maxShift = 3 } = {}) {
  // Chromium and Android round 393 x 2.75 differently (1081 against 1080), so a
  // one-pixel disagreement in either dimension is the toolchains' rounding, not a
  // design difference: the shared region is what gets compared. Anything larger is
  // two different screens.
  const width = Math.min(a.width, b.width);
  const height = Math.min(a.height, b.height);
  // Two CSS pixels: the page settles a font or a border between the measurement
  // and the capture, and an element capture rounds its own box. The layout numbers
  // are what pin the size; this only decides how much of the image is compared.
  if (Math.abs(a.width - b.width) > 6 || Math.abs(a.height - b.height) > 6) {
    throw new Error(`sizes differ: ${a.width}x${a.height} against ${b.width}x${b.height}`);
  }

  const pixel = (image, x, y) => {
    const at = (y * image.width + x) * 4;
    return [
      image.data[at] ?? 0,
      image.data[at + 1] ?? 0,
      image.data[at + 2] ?? 0,
      image.data[at + 3] ?? 255,
    ];
  };

  /**
   * The share of pixels that differ when `b` is drawn at (dx, dy) over `a`.
   *
   * The two renderers place a box on the pixel grid differently, and a 1-2 device
   * pixel offset turns every edge and every glyph into a difference while the
   * design is identical. The offset is searched and reported rather than assumed,
   * so the number says "the same screen, drawn one pixel over" instead of "a third
   * of it changed".
   *
   * The compared region is the same for every candidate: the border the largest
   * shift could reach is skipped, so a bigger shift cannot win by comparing fewer
   * pixels, and a tie goes to the smallest move.
   */
  // A small capture cannot afford the full search: the interior it would leave is
  // empty, and every shift would "differ" by comparing nothing.
  const inset = Math.min(maxShift, Math.max(0, Math.floor((Math.min(width, height) - 1) / 2)));
  const at = (dx, dy) => {
    let differing = 0;
    let compared = 0;
    for (let y = inset; y < height - inset; y += 1) {
      for (let x = inset; x < width - inset; x += 1) {
        const mine = pixel(a, x, y);
        const theirs = pixel(b, x - dx, y - dy);
        compared += 1;
        for (let channel = 0; channel < 4; channel += 1) {
          if (Math.abs(mine[channel] - theirs[channel]) > CHANNEL_TOLERANCE) {
            differing += 1;
            break;
          }
        }
      }
    }
    return compared === 0 ? 1 : differing / compared;
  };

  let best = { ratio: at(0, 0), dx: 0, dy: 0 };
  const distance = (dx, dy) => Math.abs(dx) + Math.abs(dy);
  for (let dy = -inset; dy <= inset; dy += 1) {
    for (let dx = -inset; dx <= inset; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      const ratio = at(dx, dy);
      if (ratio < best.ratio - 1e-9) {
        best = { ratio, dx, dy };
      } else if (
        Math.abs(ratio - best.ratio) <= 1e-9 &&
        distance(dx, dy) < distance(best.dx, best.dy)
      ) {
        best = { ratio, dx, dy };
      }
    }
  }

  return best;
}

/** The values one side recorded, keyed by element name. */
function elementsOf(record, surface) {
  if (!record || typeof record !== 'object' || !record.elements) return null;
  if (record.surface && record.surface !== surface) {
    throw new Error(`records "${record.surface}" as its surface, not "${surface}"`);
  }
  return new Map(
    Object.entries(record.elements).filter(([, props]) => props && typeof props === 'object')
  );
}

const round = (value) => Math.round(value * 100) / 100;

/** Compares the page's numbers with the screen's; one message per disagreement. */
export function compareLayout(
  web,
  app,
  { surface, lengthTolerance = DEFAULT_LENGTH_TOLERANCE, origin }
) {
  const page = elementsOf(web, surface);
  const screen = elementsOf(app, surface);
  if (!page) return [`"${surface}": web.json records no elements`];
  if (!screen) return [`"${surface}": app.json records no elements`];
  if (origin && (!page.has(origin) || !screen.has(origin))) {
    return [`"${surface}": the origin element "${origin}" is not recorded on both sides`];
  }
  const theirs = origin ? rebase(page, origin) : page;
  const ours = origin ? rebase(screen, origin) : screen;

  const errors = [];
  for (const [name, expected] of theirs) {
    const actual = ours.get(name);
    if (!actual) {
      errors.push(`"${surface}": ${name} is on the page and not in the app`);
      continue;
    }
    for (const [property, value] of Object.entries(expected)) {
      if (!(property in actual)) {
        errors.push(`"${surface}": ${name}.${property} was not measured in the app`);
        continue;
      }
      const mine = actual[property];
      if (typeof value === 'number' && typeof mine === 'number') {
        if (Math.abs(value - mine) > lengthTolerance) {
          errors.push(
            `"${surface}": ${name}.${property} is ${round(mine)} in the app and ${round(value)} on the page`
          );
        }
      } else if (String(mine) !== String(value)) {
        errors.push(
          `"${surface}": ${name}.${property} is "${mine}" in the app and "${value}" on the page`
        );
      }
    }
    for (const property of Object.keys(actual)) {
      if (!(property in expected)) {
        errors.push(
          `"${surface}": ${name}.${property} was measured in the app and not on the page`
        );
      }
    }
  }

  for (const name of ours.keys()) {
    if (!theirs.has(name)) errors.push(`"${surface}": ${name} is in the app and not on the page`);
  }

  return errors;
}

/**
 * Moves every element's position to be relative to one element's, usually the title.
 *
 * The app draws a screen inside its own frame and the page draws it inside the
 * site's, and those frames are not the same height: what the design actually says is
 * the *gaps* — title to card, card to its contents — not where the first row lands
 * on an 852px screen. `top` and `left` are rebased; sizes and styles are untouched.
 * A missing origin is the caller's error to report, so this returns null.
 */
function rebase(elements, origin) {
  if (!elements) return null;
  const anchor = elements.get(origin);
  if (!anchor) return null;
  const top = typeof anchor.top === 'number' ? anchor.top : 0;
  const left = typeof anchor.left === 'number' ? anchor.left : 0;
  return new Map(
    [...elements].map(([name, props]) => [
      name,
      {
        ...props,
        ...(typeof props.top === 'number' ? { top: round(props.top - top) } : {}),
        ...(typeof props.left === 'number' ? { left: round(props.left - left) } : {}),
      },
    ])
  );
}

/** The contract's own rules: named elements, known properties, no duplicates. */
export function validateContract(contract, surface) {
  const errors = [];
  if (!Array.isArray(contract.elements) || contract.elements.length === 0) {
    return [`"${surface}": the contract lists no elements`];
  }

  const names = new Set((contract.elements ?? []).map((element) => element.name));
  if (contract.origin !== undefined && !names.has(contract.origin)) {
    errors.push(`"${surface}": origin "${contract.origin}" is not one of the contract elements`);
  }

  const seen = new Set();
  for (const element of contract.elements) {
    if (!element.name) {
      errors.push(`"${surface}": a contract element has no "name"`);
      continue;
    }
    if (seen.has(element.name)) {
      errors.push(`"${surface}": the contract names ${element.name} twice`);
    }
    seen.add(element.name);
    if (!element.web?.selector) errors.push(`"${surface}": ${element.name} has no web selector`);
    if (!element.app?.tag) errors.push(`"${surface}": ${element.name} has no app test tag`);
    if (!Array.isArray(element.properties) || element.properties.length === 0) {
      errors.push(`"${surface}": ${element.name} measures nothing`);
      continue;
    }
    for (const property of element.properties) {
      if (!PROPERTIES.has(property)) {
        errors.push(
          `"${surface}": ${element.name} asks for "${property}", which is not a property`
        );
      }
    }
  }

  return errors;
}

/** Where a surface's evidence lives. */
export function evidenceFiles(surface, root = EVIDENCE) {
  const dir = join(root, surface);
  return {
    dir,
    web: join(dir, 'web.json'),
    app: join(dir, 'app.json'),
    webPng: join(dir, 'web.png'),
    appPng: join(dir, 'app.png'),
  };
}

/**
 * Everything wrong with the gate, as messages. Returns an object rather than
 * throwing so the caller can report every problem, not the first.
 */
export function validate({ gate, screens, repoRoot = ROOT, evidenceRoot = EVIDENCE }) {
  const errors = [];
  const gated = new Map();
  const enabled = new Set(
    (screens.screens ?? [])
      .filter((row) => row.enabled === true && typeof row.native === 'string')
      .map((row) => row.surface)
  );

  if (gate.schemaVersion !== 1) {
    errors.push(`docs/mobile/visual-gate.json: schemaVersion must be 1, not ${gate.schemaVersion}`);
  }

  for (const surface of gate.surfaces ?? []) {
    const id = surface.surface;
    if (!id) {
      errors.push('docs/mobile/visual-gate.json: a surface has no "surface"');
      continue;
    }
    if (gated.has(id)) errors.push(`docs/mobile/visual-gate.json: "${id}" appears twice`);
    gated.set(id, surface);

    if (!(screens.screens ?? []).some((row) => row.surface === id)) {
      errors.push(`"${id}" is gated and has no row in docs/mobile/screens.json`);
    }
    if (!surface.web?.route) errors.push(`"${id}": a gated surface names its web route`);
    if (!surface.app?.test) errors.push(`"${id}": a gated surface names the test that draws it`);

    const pixels = surface.tolerance?.pixels;
    // A ceiling, not a standard: a text-bearing card reaches a fifth of its pixels
    // through rasterisation alone. The number that matters is the one the pair
    // recorded, and a run above it fails; this only refuses a baseline so wide it
    // could hide a different screen.
    if (typeof pixels !== 'number' || !(pixels > 0) || pixels > 0.35) {
      errors.push(`"${id}": tolerance.pixels is a recorded baseline above 0 and at most 0.35`);
    }
    if (surface.baseline && !/^\d{4}-\d{2}-\d{2}$/.test(surface.baseline.recorded ?? '')) {
      errors.push(`"${id}": baseline.recorded is the date the number was recorded, YYYY-MM-DD`);
    }
    const length = surface.tolerance?.length ?? DEFAULT_LENGTH_TOLERANCE;
    if (typeof length !== 'number' || length < 0 || length > 2) {
      errors.push(`"${id}": tolerance.length is a CSS-pixel allowance from 0 to 2`);
    }

    const contractPath = surface.contract && resolve(repoRoot, surface.contract);
    let contract = null;
    if (!contractPath || !existsSync(contractPath)) {
      errors.push(`"${id}": contract ${surface.contract ?? '(none)'} does not exist`);
    } else {
      try {
        contract = JSON.parse(readFileSync(contractPath, 'utf8'));
        for (const problem of validateContract(contract, id)) errors.push(problem);
      } catch (error) {
        errors.push(`"${id}": ${surface.contract} is not JSON (${error.message})`);
      }
    }

    const files = evidenceFiles(id, evidenceRoot);
    const present = [files.web, files.app, files.webPng, files.appPng].filter((path) =>
      existsSync(path)
    );

    // Half a pair is worse than none: it looks like evidence and cannot be compared.
    if (present.length > 0 && present.length < 4) {
      const missing = Object.entries(files)
        .filter(([name]) => name !== 'dir' && !existsSync(files[name]))
        .map(([name]) => name);
      errors.push(`"${id}": the evidence is half there; missing ${missing.join(', ')}`);
      continue;
    }
    if (present.length === 0) {
      if (enabled.has(id)) {
        errors.push(`"${id}" is switched on in screens.json with no evidence recorded`);
      }
      continue;
    }

    let web;
    let app;
    try {
      web = JSON.parse(readFileSync(files.web, 'utf8'));
      app = JSON.parse(readFileSync(files.app, 'utf8'));
    } catch (error) {
      errors.push(`"${id}": a recording is not JSON (${error.message})`);
      continue;
    }

    for (const problem of compareLayout(web, app, {
      surface: id,
      lengthTolerance: length,
      origin: contract?.origin,
    })) {
      errors.push(problem);
    }

    // The contract names what has to be measured; a recording that measures less
    // than the contract asks for is a port that quietly stopped drawing a part.
    const recorded = { web: elementsOf(web, id), app: elementsOf(app, id) };
    for (const element of contract?.elements ?? []) {
      for (const side of ['web', 'app']) {
        const props = recorded[side]?.get(element.name);
        if (!props) {
          errors.push(`"${id}": ${element.name} is in the contract and not in ${side}.json`);
          continue;
        }
        for (const property of element.properties ?? []) {
          if (!(property in props)) {
            errors.push(
              `"${id}": ${element.name}.${property} is in the contract and not in ${side}.json`
            );
          }
        }
      }
    }

    try {
      const { ratio, dx, dy } = pixelDifference(
        decodePng(readFileSync(files.webPng)),
        decodePng(readFileSync(files.appPng))
      );
      if (ratio > pixels) {
        errors.push(
          `"${id}": ${(ratio * 100).toFixed(3)}% of pixels differ at the best alignment (${dx}, ${dy}), above the recorded baseline of ${(pixels * 100).toFixed(3)}%` +
            (surface.baseline?.recorded ? ` from ${surface.baseline.recorded}` : '')
        );
      }
      if (!surface.baseline) {
        errors.push(
          `"${id}": the surface has evidence and no recorded baseline; run the gate, then record tolerance.pixels and baseline.recorded`
        );
      }
    } catch (error) {
      errors.push(`"${id}": the captures cannot be compared (${error.message})`);
    }
  }

  for (const surface of enabled) {
    if (!gated.has(surface)) {
      errors.push(
        `"${surface}" is switched on in screens.json and is not under the gate (docs/mobile/visual-gate.json)`
      );
    }
  }

  return errors;
}

export function main() {
  for (const path of [GATE, SCREENS]) {
    if (!existsSync(path)) {
      console.error(`x ${relative(ROOT, path)} is missing`);
      return 1;
    }
  }

  const gate = JSON.parse(readFileSync(GATE, 'utf8'));
  const screens = JSON.parse(readFileSync(SCREENS, 'utf8'));
  const errors = validate({ gate, screens });

  if (errors.length > 0) {
    for (const error of errors) console.error(`x ${error}`);
    return 1;
  }

  const surfaces = gate.surfaces ?? [];
  const recorded = surfaces.filter((surface) =>
    Object.entries(evidenceFiles(surface.surface))
      .filter(([name]) => name !== 'dir')
      .every(([, path]) => existsSync(path))
  );
  console.log(
    `  ok ${recorded.length} surface(s) with evidence, ${surfaces.length - recorded.length} declared and not yet captured`
  );
  return 0;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main();
}
