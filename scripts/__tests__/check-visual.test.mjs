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
  elements: [
    {
      name: 'submit',
      web: { selector: '#submit' },
      app: { tag: 'submit' },
      properties: ['width', 'height', 'radius', 'color'],
    },
  ],
};

const RECORD = (width = 100) => ({
  surface: 'verify',
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
        tolerance: { pixels, length: 0.5 },
      },
    ],
  };

  const evidence = join(root, 'e2e', '__visual__');
  if (web || app) {
    const dir = join(evidence, 'verify');
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
    expect(pixelDifference(base, base)).toBe(0);
  });

  it('ignores a channel that moved by the dithering allowance', () => {
    const pixels = opaque(2, 2);
    pixels[0] += 5;
    expect(pixelDifference(base, decodePng(png(2, 2, pixels)))).toBe(0);
  });

  it('counts a pixel that visibly changed, as a share of the image', () => {
    const pixels = opaque(2, 2);
    pixels[0] = 200;
    expect(pixelDifference(base, decodePng(png(2, 2, pixels)))).toBe(0.25);
  });

  it('refuses two captures of different sizes', () => {
    expect(() => pixelDifference(base, decodePng(png(3, 2, opaque(3, 2))))).toThrow('sizes differ');
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

  it('refuses nothing to measure, a duplicate, an unknown property, a missing selector or tag', () => {
    expect(validateContract({ elements: [] }, 'verify')).toEqual([
      '"verify": the contract lists no elements',
    ]);
    expect(
      validateContract(
        {
          elements: [
            { name: 'a', web: { selector: '#a' }, app: { tag: 'a' }, properties: ['width'] },
            { name: 'a', web: { selector: '#b' }, app: { tag: 'b' }, properties: ['height'] },
          ],
        },
        'verify'
      )
    ).toEqual(['"verify": the contract names a twice']);
    expect(
      validateContract(
        {
          elements: [
            { name: 'a', web: { selector: '#a' }, app: { tag: 'a' }, properties: ['boxShadow'] },
          ],
        },
        'verify'
      )
    ).toEqual(['"verify": a asks for "boxShadow", which is not a property']);
    expect(
      validateContract(
        { elements: [{ name: 'a', web: {}, app: {}, properties: ['width'] }] },
        'verify'
      )
    ).toEqual(['"verify": a has no web selector', '"verify": a has no app test tag']);
  });
});

describe('the gate', () => {
  it('refuses a port switched on with no evidence', () => {
    expect(repo().check()).toEqual([
      '"verify" is switched on in screens.json with no evidence recorded',
    ]);
  });

  it('accepts a port whose pair agrees', () => {
    expect(repo({ web: RECORD(), app: RECORD() }).check()).toEqual([]);
  });

  it('refuses half a pair', () => {
    expect(repo({ web: RECORD() }).check()).toEqual([
      '"verify": the evidence is half there; missing app, appPng',
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
      '"verify": submit.height is in the contract and not in web.json',
      '"verify": submit.radius is in the contract and not in web.json',
      '"verify": submit.color is in the contract and not in web.json',
      '"verify": submit.height is in the contract and not in app.json',
      '"verify": submit.radius is in the contract and not in app.json',
      '"verify": submit.color is in the contract and not in app.json',
    ]);
  });

  it('refuses a port that is switched on and not under the gate at all', () => {
    const fixture = repo();
    fixture.gate.surfaces = [];
    expect(fixture.check()).toEqual([
      '"verify" is switched on in screens.json and is not under the gate (docs/mobile/visual-gate.json)',
    ]);
  });

  it('refuses a capture whose pixels differ above the surface tolerance', () => {
    const fixture = repo({ web: RECORD(), app: RECORD(), pixels: 0.05 });
    const dir = join(fixture.evidence, 'verify');
    const changed = opaque(2, 2);
    changed[0] = 200;
    writeFileSync(join(dir, 'app.png'), png(2, 2, changed));

    expect(fixture.check()).toEqual([
      '"verify": 25.000% of pixels differ, above the 5.000% this surface allows',
    ]);
  });

  it('refuses a contract that is missing, or asks for a property nobody records', () => {
    const fixture = repo();
    fixture.gate.surfaces[0].contract = 'shared/visual/gone.json';
    expect(fixture.check()).toEqual([
      '"verify": contract shared/visual/gone.json does not exist',
      '"verify" is switched on in screens.json with no evidence recorded',
    ]);
  });

  it('refuses tolerances that would pass anything', () => {
    const fixture = repo();
    fixture.gate.surfaces[0].tolerance = { pixels: 0.9, length: 40 };
    expect(fixture.check()).toEqual([
      '"verify": tolerance.pixels is a share of the image above 0 and at most 0.05',
      '"verify": tolerance.length is a CSS-pixel allowance from 0 to 2',
      '"verify" is switched on in screens.json with no evidence recorded',
    ]);
  });
});
