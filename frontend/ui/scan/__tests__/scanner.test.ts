// Which decoder the Scanner picks, and what makes it give up on the browser's
// own. jsdom ships neither `BarcodeDetector`, `Worker` nor `ImageData`, so all
// three are stood up here — the point of these tests is the *choice*, not the
// pixels behind it.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SCAN_FIXTURE_PAYLOAD } from '@/frontend/ui/scan/detector-fixture';
import { createScanEngine } from '@/frontend/ui/scan/scanner';

class FakeImageData {
  readonly data: Uint8ClampedArray;
  constructor(
    readonly width: number,
    readonly height: number
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }
}

/** The worker realm, reduced to the shape `createWasmEngine` touches. */
class FakeWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  postMessage() {}
  terminate() {}
}

/** How the stood-up native detector behaves when it is handed a symbol. */
type DetectorBehaviour = 'reads' | 'blank' | 'unavailable' | 'stalls';

function nativeReading(rawValue: string, format = 'qr_code') {
  return {
    rawValue,
    format,
    boundingBox: { x: 4, y: 8, width: 16, height: 32 },
  };
}

function stubNativeDetector(
  behaviour: DetectorBehaviour,
  { formats = ['qr_code', 'ean_13'], extra = [] as unknown[] } = {}
) {
  const detect = vi.fn((source: unknown) => {
    void source;
    if (behaviour === 'stalls') return new Promise<never>(() => {});
    if (behaviour === 'unavailable') {
      return Promise.reject(
        new DOMException('Barcode detection service unavailable', 'NotSupportedError')
      );
    }
    // `blank` is the Android failure this exists to catch: the detector answers
    // every frame, including the one it should know the answer to, with nothing.
    if (behaviour === 'blank') return Promise.resolve(extra);
    return Promise.resolve([nativeReading(SCAN_FIXTURE_PAYLOAD), ...extra]);
  });

  class Detector {
    static getSupportedFormats = () => Promise.resolve(formats);
    detect = detect;
  }

  vi.stubGlobal('BarcodeDetector', Detector);
  return detect;
}

beforeEach(() => {
  vi.stubGlobal('ImageData', FakeImageData);
  vi.stubGlobal('Worker', FakeWorker);
  // The engine announces itself on the console for field diagnosis; the tests
  // assert that it does, so the line cannot quietly disappear.
  vi.spyOn(console, 'info').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('createScanEngine', () => {
  it('keeps the browser detector while it reads the symbol we know', async () => {
    stubNativeDetector('reads');

    const engine = await createScanEngine();

    expect(engine.kind).toBe('native');
    expect(engine.detail).toContain('qr_code');
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('native'));
  });

  it('says so on the console when the browser detector was passed over', async () => {
    stubNativeDetector('blank');

    await createScanEngine();

    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('failed the check'));
  });

  it('falls back to the WASM worker when the browser detector reads nothing at all', async () => {
    stubNativeDetector('blank');

    const engine = await createScanEngine();

    expect(engine.kind).toBe('wasm');
    expect(engine.detail).toContain('failed the check');
  });

  it('falls back when the browser detector has no service behind it', async () => {
    stubNativeDetector('unavailable');

    const engine = await createScanEngine();

    expect(engine.kind).toBe('wasm');
  });

  it('gives up on a detector that never settles, instead of stalling every frame', async () => {
    vi.useFakeTimers();
    stubNativeDetector('stalls');

    const pending = createScanEngine();
    await vi.advanceTimersByTimeAsync(5000);

    expect((await pending).kind).toBe('wasm');
  });

  it('prefers the WASM worker over a detector that knows none of our formats', async () => {
    stubNativeDetector('reads', { formats: ['nonsense'] });

    const engine = await createScanEngine();

    expect(engine.kind).toBe('wasm');
  });

  it('reports a native detection in frame coordinates', async () => {
    stubNativeDetector('reads');

    const engine = await createScanEngine();
    const codes = await engine.detect(new FakeImageData(8, 8) as unknown as ImageData);

    expect(codes).toEqual([
      {
        rawValue: SCAN_FIXTURE_PAYLOAD,
        format: 'qr_code',
        box: { x: 4, y: 8, width: 16, height: 32 },
      },
    ]);
  });

  it('hands the detector the fixture symbol as its first question', async () => {
    const detect = stubNativeDetector('reads');

    await createScanEngine();

    const [asked] = detect.mock.calls[0] as unknown as [ImageData];
    expect(asked.width).toBe(asked.height);
    expect(asked.width).toBeGreaterThan(100);
  });
});
