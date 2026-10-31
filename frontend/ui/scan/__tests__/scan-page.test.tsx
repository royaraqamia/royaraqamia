import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DetectedCode } from '@/frontend/ui/scan/scan-worker';
import { GUEST_IDENTITY } from '@/frontend/shared/local-store/identity';
import { recordLocalUsage } from '@/frontend/shared/plans/plan-limits';

const { detect, imageDataFromFile, verifyCertificate } = vi.hoisted(() => ({
  detect: vi.fn(),
  imageDataFromFile: vi.fn(),
  verifyCertificate: vi.fn(),
}));

// Only the two I/O boundaries are faked: the real `largestCode`, `codeAtPoint`
// and `FrameGrabber` stay in play, so code selection is exercised for real.
vi.mock('@/frontend/ui/scan/scanner', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/frontend/ui/scan/scanner')>();
  return {
    ...actual,
    createScanEngine: async () => ({ kind: 'wasm' as const, detect, dispose: () => {} }),
    imageDataFromFile,
  };
});

vi.mock('@/frontend/api/certificates', () => ({ verifyCertificate }));

import { ScanPage } from '@/frontend/ui/scan/scan-page';

function code(rawValue: string, format = 'qr_code', size = 10): DetectedCode {
  return { rawValue, format, box: { x: 0, y: 0, width: size, height: size } };
}

function uploadAnImage() {
  fireEvent.change(screen.getByLabelText('اختيار صورة تحتوي على رمز'), {
    target: { files: [new File(['x'], 'code.png', { type: 'image/png' })] },
  });
}

beforeEach(() => {
  detect.mockReset();
  imageDataFromFile.mockReset();
  verifyCertificate.mockReset();

  detect.mockResolvedValue([]);
  imageDataFromFile.mockResolvedValue({
    data: new Uint8ClampedArray(4),
    width: 1,
    height: 1,
  } as unknown as ImageData);
  verifyCertificate.mockResolvedValue({ success: false, error: 'unavailable' });
});

describe('ScanPage', () => {
  it('does not touch the camera until the visitor asks for it', () => {
    const getUserMedia = vi.fn();
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });

    render(<ScanPage />);

    expect(screen.getByRole('button', { name: 'تشغيل الكاميرا' })).toBeInTheDocument();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('decodes an uploaded image and shows the destination host before opening', async () => {
    detect.mockResolvedValue([code('https://example.com/a?b=1')]);

    render(<ScanPage />);
    uploadAnImage();

    await waitFor(() => expect(screen.getByText('example.com')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /فتح الرَّابط/ })).toHaveAttribute(
      'href',
      'https://example.com/a?b=1'
    );
  });

  it('offers no open action for a javascript: payload', async () => {
    detect.mockResolvedValue([code('javascript:alert(1)')]);

    render(<ScanPage />);
    uploadAnImage();

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByRole('link')).not.toBeInTheDocument();
  });

  it('takes the largest code when several share the frame', async () => {
    detect.mockResolvedValue([code('small', 'qr_code', 10), code('large', 'ean_13', 100)]);

    render(<ScanPage />);
    uploadAnImage();

    await waitFor(() => expect(screen.getByText('large')).toBeInTheDocument());
    expect(screen.queryByText('small')).not.toBeInTheDocument();
  });

  it('renders the Certificate card for one of our own verification links', async () => {
    verifyCertificate.mockResolvedValue({
      success: true,
      certificate: {
        id: '11111111-1111-4111-8111-111111111111',
        certificate_code: 'COMP-2026-UHVW9SG5',
        student_name: 'أيْهَم',
        course_name: 'بناء التَّطبيقات',
        issue_date: '2026-01-01',
        expiration_date: null,
        grade_or_status: null,
        created_at: '2026-01-01T00:00:00.000Z',
      },
    });
    detect.mockResolvedValue([code('https://royaraqamia.com/verify/COMP-2026-UHVW9SG5')]);

    render(<ScanPage />);
    uploadAnImage();

    await waitFor(() => expect(verifyCertificate).toHaveBeenCalledWith('COMP-2026-UHVW9SG5'), {
      timeout: 5000,
    });
    // The result surface is lazily loaded, so give the chunk a moment to land.
    expect(
      await screen.findByText('COMP-2026-UHVW9SG5', {}, { timeout: 5000 })
    ).toBeInTheDocument();
  });
});

/**
 * One refusal, three audiences. A shell below counter 20005 has no camera
 * permission in its manifest (ADR-0053), so Android refuses the WebView's
 * request with no dialog and `getUserMedia` reports the same `NotAllowedError`
 * a visitor's own "no" produces — the shell's user agent is the only thing that
 * tells the two apart. Matched on diacritic-free phrases so a test asserts which
 * message was chosen, not how the Arabic is vowelled.
 */
describe('ScanPage camera denial', () => {
  const BROWSER_UA =
    'Mozilla/5.0 (Linux; Android 11; sdk_gphone_x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.106 Mobile Safari/537.36';

  let restoreUserAgent: (() => void) | null = null;

  function useUserAgent(userAgent: string) {
    const previous = Object.getOwnPropertyDescriptor(navigator, 'userAgent');
    Object.defineProperty(navigator, 'userAgent', { value: userAgent, configurable: true });
    restoreUserAgent = () => {
      if (previous) Object.defineProperty(navigator, 'userAgent', previous);
      restoreUserAgent = null;
    };
  }

  afterEach(() => restoreUserAgent?.());

  function denyCamera() {
    const getUserMedia = vi
      .fn()
      .mockRejectedValue(new DOMException('Permission denied', 'NotAllowedError'));
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });
  }

  async function askForTheCamera() {
    render(<ScanPage />);
    fireEvent.click(screen.getByRole('button', { name: 'تشغيل الكاميرا' }));
    return screen.findByRole('alert');
  }

  it('points a browser visitor at the browser settings', async () => {
    useUserAgent(BROWSER_UA);
    denyCamera();

    expect(await askForTheCamera()).toHaveTextContent('اسمح للموقع');
  });

  it('tells a shell that predates the permission to update the app', async () => {
    useUserAgent(`${BROWSER_UA} RoyaraqamiaShell/1.0.4+20004`);
    denyCamera();

    const alert = await askForTheCamera();
    expect(alert).toHaveTextContent('صفحة الحساب');
    expect(alert).not.toHaveTextContent('اسمح للموقع');
  });

  it('points a shell that has the permission at the system settings', async () => {
    useUserAgent(`${BROWSER_UA} RoyaraqamiaShell/1.0.6+20006`);
    denyCamera();

    const alert = await askForTheCamera();
    expect(alert).toHaveTextContent('إذن الكاميرا');
    expect(alert).not.toHaveTextContent('اسمح للموقع');
  });
});

/**
 * A spent allowance must close the camera, not strand it.
 *
 * The preview is a live `MediaStream`: refusing a Scan while leaving the loop
 * stopped mid-`scanning` keeps the camera (and the phone's camera indicator) on
 * behind a frame that will never decode again. The camera here is a fake whose
 * every track records its own `stop()`, so "no live track" is asserted on the
 * one call that makes a track dead.
 */
describe('ScanPage with the scan allowance spent', () => {
  const restores: Array<() => void> = [];

  /** A read-only DOM value jsdom reports as zero, pinned for the loop's sake. */
  function pin(target: object, key: string, value: unknown) {
    const descriptor = Object.getOwnPropertyDescriptor(target, key);
    Object.defineProperty(target, key, { configurable: true, get: () => value });
    restores.push(() => {
      if (descriptor) Object.defineProperty(target, key, descriptor);
      else delete (target as Record<string, unknown>)[key];
    });
  }

  beforeEach(() => {
    // One guest Scan is the whole daily allowance, so recording one spends it.
    recordLocalUsage(GUEST_IDENTITY, 'scanner.scan');

    // jsdom's frame clock is never driven, so the scan loop would not tick.
    const frame = vi
      .spyOn(window, 'requestAnimationFrame')
      .mockImplementation((callback) => window.setTimeout(() => callback(performance.now()), 0));
    const cancelFrame = vi
      .spyOn(window, 'cancelAnimationFrame')
      .mockImplementation((handle) => window.clearTimeout(handle));
    restores.push(() => {
      frame.mockRestore();
      cancelFrame.mockRestore();
    });

    // jsdom never plays a video and reports no frame size, so `tick()` would
    // find nothing to hand the decoder. `readyState` lives on HTMLMediaElement,
    // the frame size on HTMLVideoElement.
    const play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined as never);
    restores.push(() => play.mockRestore());
    pin(HTMLMediaElement.prototype, 'readyState', 4);
    pin(HTMLVideoElement.prototype, 'videoWidth', 1280);
    pin(HTMLVideoElement.prototype, 'videoHeight', 720);

    // jsdom has no 2D canvas, so a frame read is null and the loop would never
    // reach the decoder. The pixels are irrelevant: `detect` is faked.
    const context = {
      drawImage: () => {},
      getImageData: () => ({ data: new Uint8ClampedArray(4), width: 1, height: 1 }),
      setTransform: () => {},
      clearRect: () => {},
      strokeRect: () => {},
    } as unknown as CanvasRenderingContext2D;
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(context);
    restores.push(() => getContext.mockRestore());

    detect.mockResolvedValue([code('https://example.com/a')]);
  });

  afterEach(() => {
    for (const restore of restores.splice(0)) restore();
  });

  /** A camera whose stream carries one video track that can be told to stop. */
  function openCamera() {
    const track = { stop: vi.fn(), getCapabilities: () => ({}) };
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
    const getUserMedia = vi.fn().mockResolvedValue(stream);
    const previous = Object.getOwnPropertyDescriptor(navigator, 'mediaDevices');
    Object.defineProperty(navigator, 'mediaDevices', {
      value: { getUserMedia },
      configurable: true,
    });
    restores.push(() => {
      if (previous) Object.defineProperty(navigator, 'mediaDevices', previous);
      else delete (navigator as unknown as Record<string, unknown>).mediaDevices;
    });
    return { track, getUserMedia };
  }

  function video(): HTMLVideoElement {
    const element = document.querySelector('video');
    if (!element) throw new Error('the preview is not mounted');
    return element;
  }

  async function startScanning() {
    fireEvent.click(screen.getByRole('button', { name: 'تشغيل الكاميرا' }));
    await waitFor(() => expect(screen.getByText('وجِّه الرَّمز داخل الإطار…')).toBeInTheDocument());
  }

  it('stops the stream and returns to the idle frame when a Scan is refused', async () => {
    const { track, getUserMedia } = openCamera();
    render(<ScanPage />);

    await startScanning();
    await waitFor(() => expect(track.stop).toHaveBeenCalled());

    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(video().srcObject).toBeNull();
    expect(screen.queryByText('وجِّه الرَّمز داخل الإطار…')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'تشغيل الكاميرا' })).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent('حصَّتك');
  });

  it('refuses again and closes the camera again when the visitor retries', async () => {
    const { track } = openCamera();
    render(<ScanPage />);

    await startScanning();
    await waitFor(() => expect(track.stop).toHaveBeenCalled());

    fireEvent.click(screen.getByRole('button', { name: 'تشغيل الكاميرا' }));
    await waitFor(() => expect(track.stop).toHaveBeenCalledTimes(2));

    expect(video().srcObject).toBeNull();
    expect(screen.queryByText('وجِّه الرَّمز داخل الإطار…')).not.toBeInTheDocument();
  });

  it('still shows the Scan Result when a permitted Scan reads a code', async () => {
    window.localStorage.clear();
    const { track } = openCamera();
    render(<ScanPage />);

    await startScanning();
    await waitFor(() => expect(screen.getByText('example.com')).toBeInTheDocument());

    expect(track.stop).toHaveBeenCalled();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
