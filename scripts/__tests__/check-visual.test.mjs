import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { deflateSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import {
  compareLayout,
  decodePng,
  pixelDifference,
  validate,
  validateContract,
} from '../check-visual.mjs';

/** A minimal encoder, so a test can make the two captures it needs. */
function png(width, height, pixels) {
  const crcTable = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (buffer) => {
    let c = 0xffffffff;
    for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const chunk = (type, body) => {
    const length = Buffer.alloc(4);
    length.writeUInt32BE(body.length);
    const typeAndBody = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const check = Buffer.alloc(4);
    check.writeUInt32BE(crc(typeAndBody));
    return Buffer.concat([length, typeAndBody, check]);
  };

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    Buffer.from(pixels.subarray(y * stride, (y + 1) * stride)).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from('89504e470d0a1a0a', 'hex'),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const opaque = (width, height) => {
  const data = Buffer.alloc(width * height * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 20;
    data[i + 1] = 30;
    data[i + 2] = 40;
    data[i + 3] = 255;
  }
  return data;
};

const CONTRACT = {
  states: [
    {
      name: 'at-rest',
      elements: [
        {
          name: 'submit',
          web: { selector: '#submit' },
          app: { tag: 'submit' },
          properties: ['width', 'height', 'radius', 'color'],
        },
      ],
    },
  ],
};

const RECORD = (width = 100) => ({
  surface: 'verify',
  state: 'at-rest',
  elements: {
    submit: { width, height: 44, radius: 9999, color: 'rgb(255, 255, 255)' },
  },
});

/** A throwaway repo with one gated surface; `evidence` is what was recorded. */
function repo({ contract = CONTRACT, web, app, pixels = 0.002 } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'visual-'));
  const shared = join(root, 'shared', 'visual');
  mkdirSync(shared, { recursive: true });
  writeFileSync(join(shared, 'verify.json'), JSON.stringify(contract));

  const gate = {
    schemaVersion: 1,
    surfaces: [
      {
        surface: 'verify',
        web: { route: '/verify' },
        contract: 'shared/visual/verify.json',
        app: { test: 'VerifyScreenVisualTest.kt' },
        states: [
          {
            name: 'at-rest',
            tolerance: { pixels, length: 0.5 },
            baseline: { recorded: '2026-11-03' },
          },
        ],
      },
    ],
  };

  const evidence = join(root, 'e2e', '__visual__');
  if (web || app) {
    const dir = join(evidence, 'verify', 'at-rest');
    mkdirSync(dir, { recursive: true });
    if (web) {
      writeFileSync(join(dir, 'web.json'), JSON.stringify(web));
      writeFileSync(join(dir, 'web.png'), png(2, 2, opaque(2, 2)));
    }
    if (app) {
      writeFileSync(join(dir, 'app.json'), JSON.stringify(app));
      writeFileSync(join(dir, 'app.png'), png(2, 2, opaque(2, 2)));
    }
  }

  return {
    root,
    evidence,
    gate,
    screens: { screens: [{ surface: 'verify', native: 'x/VerifyScreen.kt', enabled: true }] },
    check(overrides = {}) {
      return validate({
        gate,
        screens: this.screens,
        repoRoot: root,
        evidenceRoot: evidence,
        ...overrides,
      });
    },
  };
}

describe('the PNG reader', () => {
  it('reads back the pixels it was given', () => {
    const pixels = opaque(3, 2);
    pixels[4] = 200;

    const decoded = decodePng(png(3, 2, pixels));

    expect({ width: decoded.width, height: decoded.height }).toEqual({ width: 3, height: 2 });
    expect(decoded.data[4]).toBe(200);
    expect(decoded.data[3]).toBe(255);
  });

  it('refuses a file that is not a PNG', () => {
    expect(() => decodePng(Buffer.from('not a picture'))).toThrow('not a PNG');
  });
});

describe('the pixel diff', () => {
  const base = decodePng(png(2, 2, opaque(2, 2)));

  it('is zero for the same picture', () => {
    expect(pixelDifference(base, base).ratio).toBe(0);
  });

  it('ignores a channel that moved by the dithering allowance', () => {
    const pixels = opaque(2, 2);
    pixels[0] += 5;
    expect(pixelDifference(base, decodePng(png(2, 2, pixels))).ratio).toBe(0);
  });

  it('counts a pixel that visibly changed, as a share of the image', () => {
    const pixels = opaque(2, 2);
    pixels[0] = 200;
    // Alignment is off here: a two-pixel image can be slid until the changed
    // pixel falls outside the compared region, which is not what this counts.
    expect(pixelDifference(base, decodePng(png(2, 2, pixels)), { maxShift: 0 }).ratio).toBe(0.25);
  });

  it('finds the offset that puts the same screen back on itself', () => {
    const size = 16;
    const wide = opaque(size, size);
    // A pattern whose every column and row is distinguishable, so a shift cannot
    // hide behind a repeated column.
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const i = (y * size + x) * 4;
        wide[i] = (x * 17) % 256;
        wide[i + 1] = (y * 13) % 256;
        wide[i + 2] = (x + y) % 256;
      }
    }
    const moved = Buffer.alloc(wide.length);
    // The same picture, one pixel to the left: every edge differs at (0, 0).
    for (let y = 0; y < size; y += 1) {
      for (let x = 0; x < size; x += 1) {
        const to = (y * size + x) * 4;
        const from = (y * size + Math.min(size - 1, x + 1)) * 4;
        Buffer.from(wide.subarray(from, from + 4)).copy(moved, to);
      }
    }

    expect(
      pixelDifference(decodePng(png(size, size, moved)), decodePng(png(size, size, wide)))
    ).toEqual({
      ratio: 0,
      dx: -1,
      dy: 0,
    });
  });

  it('compares the shared region when the two toolchains round a pixel apart', () => {
    const pixels = opaque(2, 2);
    pixels[0] = 200;
    // Chromium rounds 393 x 2.75 up and Android down, so one dimension can be a
    // pixel larger on one side; the shared region is what is compared.
    const wider = decodePng(png(3, 2, opaque(3, 2)));

    expect(() => pixelDifference(base, wider)).not.toThrow();
    expect(pixelDifference(base, wider).ratio).toBe(0);
  });

  it('refuses two captures of different sizes', () => {
    expect(() => pixelDifference(base, decodePng(png(12, 2, opaque(12, 2))))).toThrow(
      'sizes differ'
    );
  });
});

describe('the layout contract', () => {
  it('accepts a pair that agrees', () => {
    expect(compareLayout(RECORD(), RECORD(), { surface: 'verify' })).toEqual([]);
  });

  it('names the element, the property and both values when a box moved', () => {
    expect(compareLayout(RECORD(), RECORD(120), { surface: 'verify' })).toEqual([
      '"verify": submit.width is 120 in the app and 100 on the page',
    ]);
  });

  it('allows the length tolerance it was given, and no more', () => {
    expect(
      compareLayout(RECORD(), RECORD(100.4), { surface: 'verify', lengthTolerance: 0.5 })
    ).toEqual([]);
    expect(
      compareLayout(RECORD(), RECORD(100.6), { surface: 'verify', lengthTolerance: 0.5 })
    ).toHaveLength(1);
  });

  it('compares colours as text, not as numbers', () => {
    const app = RECORD();
    app.elements.submit.color = 'rgb(254, 255, 255)';
    expect(compareLayout(RECORD(), app, { surface: 'verify' })).toEqual([
      '"verify": submit.color is "rgb(254, 255, 255)" in the app and "rgb(255, 255, 255)" on the page',
    ]);
  });

  it('reports an element only one side draws, in either direction', () => {
    const app = RECORD();
    app.elements.extra = { width: 1 };
    expect(compareLayout(RECORD(), app, { surface: 'verify' })).toEqual([
      '"verify": extra is in the app and not on the page',
    ]);
    expect(compareLayout(app, RECORD(), { surface: 'verify' })).toEqual([
      '"verify": extra is on the page and not in the app',
    ]);
  });

  it('rebases positions on the origin, so two different frames compare by their gaps', () => {
    const web = {
      surface: 'verify',
      elements: { title: { top: 96, height: 46 }, card: { top: 174, width: 361 } },
    };
    const app = {
      surface: 'verify',
      elements: { title: { top: 64, height: 46 }, card: { top: 142, width: 361 } },
    };

    expect(compareLayout(web, app, { surface: 'verify', origin: 'title' })).toEqual([]);
    // Without an origin the same pair fails by the frame's own top.
    expect(compareLayout(web, app, { surface: 'verify' })).toHaveLength(2);
  });

  it('refuses a contract whose origin is not an element it measures', () => {
    expect(
      validateContract(
        { states: [{ name: 'at-rest', origin: 'header', elements: CONTRACT.states[0].elements }] },
        'verify'
      )
    ).toEqual(['"verify/at-rest": origin "header" is not one of the state\'s elements']);
  });

  it('reports a property nobody measured', () => {
    const app = RECORD();
    delete app.elements.submit.radius;
    expect(compareLayout(RECORD(), app, { surface: 'verify' })).toEqual([
      '"verify": submit.radius was not measured in the app',
    ]);
  });
});

describe('the contract itself', () => {
  it('accepts the surface it describes', () => {
    expect(validateContract(CONTRACT, 'verify')).toEqual([]);
  });

  it('refuses a contract with no states', () => {
    expect(validateContract({ elements: [] }, 'verify')).toEqual([
      '"verify": the contract lists no states',
    ]);
  });

  it('refuses nothing to measure, a duplicate, an unknown property, a missing selector or tag', () => {
    expect(validateContract({ states: [{ name: 'at-rest', elements: [] }] }, 'verify')).toEqual([
      '"verify/at-rest": the state lists no elements',
    ]);
    expect(
      validateContract(
        {
          states: [
            {
              name: 'at-rest',
              elements: [
                { name: 'a', web: { selector: '#a' }, app: { tag: 'a' }, properties: ['width'] },
                { name: 'a', web: { selector: '#b' }, app: { tag: 'b' }, properties: ['height'] },
              ],
            },
          ],
        },
        'verify'
      )
    ).toEqual(['"verify/at-rest": the state names a twice']);
    expect(
      validateContract(
        {
          states: [
            {
              name: 'at-rest',
              elements: [
                {
                  name: 'a',
                  web: { selector: '#a' },
                  app: { tag: 'a' },
                  properties: ['boxShadow'],
                },
              ],
            },
          ],
        },
        'verify'
      )
    ).toEqual(['"verify/at-rest": a asks for "boxShadow", which is not a property']);
    expect(
      validateContract(
        {
          states: [
            {
              name: 'at-rest',
              elements: [{ name: 'a', web: {}, app: {}, properties: ['width'] }],
            },
          ],
        },
        'verify'
      )
    ).toEqual([
      '"verify/at-rest": a has no web selector',
      '"verify/at-rest": a has no app test tag',
    ]);
  });

  it('refuses the same state twice', () => {
    expect(
      validateContract(
        {
          states: [
            { name: 'at-rest', elements: CONTRACT.states[0].elements },
            { name: 'at-rest', elements: CONTRACT.states[0].elements },
          ],
        },
        'verify'
      )
    ).toEqual(['"verify/at-rest": the contract names the state twice']);
  });
});

describe('the gate', () => {
  /** A throwaway repo whose gate carries the frame instead of a surface. */
  function frameRepo({
    contract = CONTRACT,
    web,
    app,
    why = 'the bars are glass over the page',
    raster = 'none',
  } = {}) {
    const root = mkdtempSync(join(tmpdir(), 'visual-frame-'));
    const shared = join(root, 'shared', 'visual');
    mkdirSync(shared, { recursive: true });
    writeFileSync(join(shared, 'chrome.json'), JSON.stringify(contract));

    const gate = {
      schemaVersion: 1,
      surfaces: [],
      frame: {
        id: 'chrome',
        web: { route: '/' },
        contract: 'shared/visual/chrome.json',
        app: { test: 'ShellFrameVisualTest.kt' },
        ...(raster === 'none' ? { raster: 'none', why } : {}),
        states: [
          {
            name: 'at-rest',
            tolerance: raster === 'none' ? { length: 0.5 } : { pixels: 0.01, length: 0.5 },
          },
        ],
      },
    };

    const evidence = join(root, 'e2e', '__visual__');
    // The fixture records name the surface they were written for; a frame's
    // recordings name the frame.
    const asChrome = (record) => (record ? { ...record, surface: 'chrome' } : record);
    if (web || app) {
      const dir = join(evidence, 'chrome', 'at-rest');
      mkdirSync(dir, { recursive: true });
      if (web) writeFileSync(join(dir, 'web.json'), JSON.stringify(asChrome(web)));
      if (app) writeFileSync(join(dir, 'app.json'), JSON.stringify(asChrome(app)));
    }

    return {
      gate,
      screens: { screens: [] },
      check(overrides = {}) {
        return validate({
          gate,
          screens: this.screens,
          repoRoot: root,
          evidenceRoot: evidence,
          ...overrides,
        });
      },
    };
  }

  it('accepts a frame whose numbers agree and which says why it has no raster', () => {
    expect(frameRepo({ web: RECORD(), app: RECORD() }).check()).toEqual([]);
  });

  it('refuses a frame measured without a raster and without the reason', () => {
    const fixture = frameRepo({ web: RECORD(), app: RECORD(), why: '  ' });
    expect(fixture.check()).toEqual([
      '"chrome": the frame is measured without a raster, so "why" says what the page\'s pixels are that the app cannot draw',
    ]);
  });

  it('refuses a frame whose boxes moved, by name and both values', () => {
    expect(frameRepo({ web: RECORD(), app: RECORD(120) }).check()).toEqual([
      '"chrome": submit.width is 120 in the app and 100 on the page',
    ]);
  });

  it('refuses half a frame recording', () => {
    expect(frameRepo({ web: RECORD() }).check()).toEqual([
      '"chrome/at-rest": the evidence is half there; missing app',
    ]);
  });

  it('refuses a frame that shares its id with a gated surface', () => {
    const fixture = frameRepo({ web: RECORD(), app: RECORD() });
    fixture.gate.surfaces = [
      {
        surface: 'chrome',
        web: { route: '/verify' },
        contract: 'shared/visual/chrome.json',
        app: { test: 'x.kt' },
        states: [
          {
            name: 'at-rest',
            tolerance: { pixels: 0.01, length: 0.5 },
            baseline: { recorded: '2026-11-03' },
          },
        ],
      },
    ];
    expect(fixture.check()).toContain(
      '"chrome" is a gated surface and the frame; they need different ids'
    );
  });

  it('refuses a frame that claims a raster and records no raster for it', () => {
    const fixture = frameRepo({ web: RECORD(), app: RECORD(), raster: 'on' });
    expect(fixture.check()).toContain(
      '"chrome/at-rest": the evidence is half there; missing webPng, appPng'
    );
  });

  it('refuses a port switched on with no evidence', () => {
    expect(repo().check()).toEqual([
      '"verify/at-rest" is switched on in screens.json with no evidence recorded',
    ]);
  });

  it('accepts a port whose pair agrees', () => {
    expect(repo({ web: RECORD(), app: RECORD() }).check()).toEqual([]);
  });

  it('refuses half a pair', () => {
    expect(repo({ web: RECORD() }).check()).toEqual([
      '"verify/at-rest": the evidence is half there; missing app, appPng',
    ]);
  });

  it('refuses a moved box by name', () => {
    expect(repo({ web: RECORD(), app: RECORD(120) }).check()).toEqual([
      '"verify": submit.width is 120 in the app and 100 on the page',
    ]);
  });

  it('refuses a recording that stopped measuring what the contract names', () => {
    const app = { surface: 'verify', elements: { submit: { width: 100 } } };
    const web = { surface: 'verify', elements: { submit: { width: 100 } } };
    expect(repo({ web, app }).check()).toEqual([
      '"verify/at-rest": submit.height is in the contract and not in web.json',
      '"verify/at-rest": submit.radius is in the contract and not in web.json',
      '"verify/at-rest": submit.color is in the contract and not in web.json',
      '"verify/at-rest": submit.height is in the contract and not in app.json',
      '"verify/at-rest": submit.radius is in the contract and not in app.json',
      '"verify/at-rest": submit.color is in the contract and not in app.json',
    ]);
  });

  it('refuses a port that is switched on and not under the gate at all', () => {
    const fixture = repo();
    fixture.gate.surfaces = [];
    expect(fixture.check()).toEqual([
      '"verify" is switched on in screens.json and is not under the gate (docs/mobile/visual-gate.json)',
    ]);
  });

  it('refuses a capture whose pixels differ above the state tolerance', () => {
    const fixture = repo({ web: RECORD(), app: RECORD(), pixels: 0.05 });
    const dir = join(fixture.evidence, 'verify', 'at-rest');
    // Half the card repainted: no offset makes that the same screen, which is what
    // the gate has to refuse.
    const changed = opaque(20, 20);
    for (let y = 0; y < 20; y += 1) {
      for (let x = 0; x < 10; x += 1) changed[(y * 20 + x) * 4] = 200;
    }
    writeFileSync(join(dir, 'web.png'), png(20, 20, opaque(20, 20)));
    writeFileSync(join(dir, 'app.png'), png(20, 20, changed));

    const errors = fixture.check();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/% of pixels differ at the best alignment/);
    expect(errors[0]).toMatch(/above the recorded baseline of 5\.000% from 2026-11-03/);
  });

  it('refuses a contract that is missing, or asks for a property nobody records', () => {
    const fixture = repo();
    fixture.gate.surfaces[0].contract = 'shared/visual/gone.json';
    expect(fixture.check()).toEqual([
      '"verify": contract shared/visual/gone.json does not exist',
      '"verify/at-rest" is switched on in screens.json with no evidence recorded',
    ]);
  });

  it('refuses tolerances that would pass anything', () => {
    const fixture = repo();
    fixture.gate.surfaces[0].states[0].tolerance = { pixels: 0.9, length: 40 };
    expect(fixture.check()).toEqual([
      '"verify/at-rest": tolerance.pixels is a recorded baseline above 0 and at most 0.35',
      '"verify/at-rest": tolerance.length is a CSS-pixel allowance from 0 to 2',
      '"verify/at-rest" is switched on in screens.json with no evidence recorded',
    ]);
  });

  it('refuses a surface whose gate entry declares no states', () => {
    const fixture = repo();
    fixture.gate.surfaces[0].states = [];
    expect(fixture.check()).toEqual([
      '"verify": the gate entry declares no states',
      '"verify/at-rest": the contract describes this state and the gate does not measure it',
    ]);
  });

  it('refuses a state the contract describes and the gate does not measure', () => {
    const fixture = repo({ web: RECORD(), app: RECORD() });
    fixture.gate.surfaces[0].states.push({
      name: 'bulk-bar',
      tolerance: { pixels: 0.05, length: 0.5 },
      baseline: { recorded: '2026-11-03' },
    });
    expect(fixture.check()).toEqual([
      '"verify": the gate measures the state "bulk-bar" and the contract does not',
      '"verify/bulk-bar" is switched on in screens.json with no evidence recorded',
    ]);
  });

  it('refuses a state with evidence and no recorded baseline', () => {
    const fixture = repo({ web: RECORD(), app: RECORD() });
    delete fixture.gate.surfaces[0].states[0].baseline;
    expect(fixture.check()).toEqual([
      '"verify/at-rest": the state has evidence and no recorded baseline; run the gate, then record tolerance.pixels and baseline.recorded',
    ]);
  });
});
