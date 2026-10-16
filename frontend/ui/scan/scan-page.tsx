'use client';

import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent } from 'react';
import dynamic from 'next/dynamic';
import {
  Camera,
  Flashlight,
  FlashlightOff,
  Loader2,
  ScanBarcode,
  Square,
  Upload,
} from 'lucide-react';
import { Button } from '@/frontend/ui/primitives/button';
import { Card, CardContent } from '@/frontend/ui/primitives/card';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { cn } from '@/frontend/shared/cn';
import { shellVersionFromUserAgent } from '@/frontend/shared/shell-update';
import { useScannedCertificate } from '@/frontend/state/scan/use-scanned-certificate';
import {
  SCAN_FORMAT_LABELS,
  SCAN_RESULT_KIND_LABELS,
  classifyScanPayload,
} from '@/shared/contracts/scan';
import { computeFrameTransform, displayToFrame, frameToDisplay } from './overlay';
import {
  FrameGrabber,
  SCAN_MAX_FRAME_WIDTH,
  SCAN_MAX_UPLOAD_BYTES,
  codeAtPoint,
  createScanEngine,
  imageDataFromFile,
  largestCode,
  type ScanEngine,
} from './scanner';
import type { DetectedCode } from './scan-worker';

type Status = 'idle' | 'starting' | 'scanning' | 'result';

/**
 * The result surface only exists after a code has been read, so it stays out of
 * the Scanner's first paint — the same reason the decoder itself is lazy.
 */
const ScanResultCard = dynamic(
  () => import('./scan-result-card').then((mod) => mod.ScanResultCard),
  { ssr: false }
);

/** How often a frame is handed to the decoder. Ten a second reads a steady hand. */
const SCAN_INTERVAL_MS = 120;

/** After a hit, ignore the same code for a moment so a rescan does not bounce back. */
const RESCAN_COOLDOWN_MS = 1200;

/** Consecutive decode failures that mean the decoder, not the frame, is broken. */
const SCAN_MAX_FRAME_ERRORS = 10;

/**
 * The first shell whose manifest declares `android.permission.CAMERA`.
 *
 * Below it, the app never asks Android for the camera, and the platform refuses
 * the WebView's request without drawing a dialog — Chrome then rejects
 * `getUserMedia` with `NotAllowedError`, the same error a visitor's own refusal
 * produces, and one no device setting can undo (ADR-0053). A visitor on such a
 * build needs the update the shell already offers, not a settings screen that
 * cannot help them.
 */
const SHELL_CAMERA_PERMISSION_CODE = 20006;

function cameraErrorMessage(caught: unknown, shellVersionCode: number | null): string {
  const name = caught instanceof DOMException ? caught.name : '';

  // A denial inside the shell has two causes that look identical from here, and
  // the shell's own version is what tells them apart: an installed build that
  // cannot ask for the camera at all, or one that asked and was refused.
  if ((name === 'NotAllowedError' || name === 'SecurityError') && shellVersionCode !== null) {
    return shellVersionCode < SHELL_CAMERA_PERMISSION_CODE
      ? 'نسخة التَّطبيق هذه لا تستطيع استخدام الكاميرا. حدِّث التَّطبيق من صفحة الحساب، أو ارفع صورة للرَّمز.'
      : 'لم يُسمَح للتَّطبيق بالوصول إلى الكاميرا. فعِّل إذن الكاميرا للتَّطبيق من إعدادات النِّظام، أو ارفع صورة للرَّمز.';
  }

  switch (name) {
    case 'NotAllowedError':
    case 'SecurityError':
      return 'لم يُسمَح بالوصول إلى الكاميرا. اسمح للموقع باستخدامها من إعدادات المتصفِّح، أو ارفع صورة للرَّمز.';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'لا توجد كاميرا مُتاحة على هذا الجهاز. ارفع صورة للرَّمز بدلًا من ذلك.';
    case 'NotReadableError':
      return 'الكاميرا مشغولة بتطبيق آخر. أغلق التَّطبيق الآخر ثمَّ أعد المحاولة.';
    default:
      return 'تعذَّر تشغيل الكاميرا. ارفع صورة للرَّمز بدلًا من ذلك.';
  }
}

export function ScanPage() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const engineRef = useRef<ScanEngine | null>(null);
  const enginePromiseRef = useRef<Promise<ScanEngine> | null>(null);
  const grabberRef = useRef<FrameGrabber | null>(null);
  const codesRef = useRef<DetectedCode[]>([]);
  const frameSizeRef = useRef<{ width: number; height: number } | null>(null);
  const rafRef = useRef<number | null>(null);
  const runningRef = useRef(false);
  const disposedRef = useRef(false);
  const nextRunRef = useRef(0);
  const cooldownRef = useRef(0);
  const frameErrorsRef = useRef(0);

  const [status, setStatus] = useState<Status>('idle');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [torchAvailable, setTorchAvailable] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [hit, setHit] = useState<{ rawValue: string; format: string } | null>(null);

  const classification = hit ? classifyScanPayload(hit.rawValue) : null;
  const certificate = useScannedCertificate(hit?.rawValue ?? null);
  const formatLabel = hit ? (SCAN_FORMAT_LABELS[hit.format] ?? hit.format) : '';

  // Tear the camera and the worker down on unmount, whatever state we are in.
  useEffect(() => {
    return () => {
      disposedRef.current = true;
      runningRef.current = false;
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
      const stream = streamRef.current;
      streamRef.current = null;
      if (stream) for (const track of stream.getTracks()) track.stop();
      engineRef.current?.dispose();
      engineRef.current = null;
      enginePromiseRef.current = null;
    };
  }, []);

  function ensureEngine(): Promise<ScanEngine> {
    enginePromiseRef.current ??= createScanEngine().then((engine) => {
      engineRef.current = engine;
      if (disposedRef.current) engine.dispose();
      return engine;
    });
    return enginePromiseRef.current;
  }

  function clearOverlay() {
    const overlay = overlayRef.current;
    const context = overlay?.getContext('2d');
    if (overlay && context) context.clearRect(0, 0, overlay.width, overlay.height);
  }

  function currentTransform() {
    const video = videoRef.current;
    const overlay = overlayRef.current;
    const frame = frameSizeRef.current;
    if (!video || !overlay || !frame) return null;

    const boxWidth = video.clientWidth;
    const boxHeight = video.clientHeight;
    if (!boxWidth || !boxHeight) return null;

    return {
      boxWidth,
      boxHeight,
      overlay,
      transform: computeFrameTransform({
        videoWidth: video.videoWidth,
        videoHeight: video.videoHeight,
        frameWidth: frame.width,
        frameHeight: frame.height,
        boxWidth,
        boxHeight,
      }),
    };
  }

  function drawOverlay() {
    const context = currentTransform();
    if (!context) return;
    const { boxWidth, boxHeight, overlay, transform } = context;

    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(boxWidth * ratio);
    const pixelHeight = Math.round(boxHeight * ratio);
    if (overlay.width !== pixelWidth || overlay.height !== pixelHeight) {
      overlay.width = pixelWidth;
      overlay.height = pixelHeight;
    }

    const drawing = overlay.getContext('2d');
    if (!drawing) return;
    drawing.setTransform(ratio, 0, 0, ratio, 0, 0);
    drawing.clearRect(0, 0, boxWidth, boxHeight);
    drawing.lineWidth = 3;
    drawing.strokeStyle = '#34d399';
    drawing.shadowColor = 'rgba(0,0,0,0.45)';
    drawing.shadowBlur = 6;

    for (const code of codesRef.current) {
      const corner = frameToDisplay(transform, code.box.x, code.box.y);
      drawing.strokeRect(
        corner.x,
        corner.y,
        code.box.width * transform.pxPerFrame,
        code.box.height * transform.pxPerFrame
      );
    }
  }

  function stopStream() {
    const stream = streamRef.current;
    streamRef.current = null;
    if (stream) for (const track of stream.getTracks()) track.stop();
    if (videoRef.current) videoRef.current.srcObject = null;
    setTorchAvailable(false);
    setTorchOn(false);
  }

  function haltLoop() {
    runningRef.current = false;
    if (rafRef.current !== null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }

  function stopCamera() {
    haltLoop();
    stopStream();
    codesRef.current = [];
    clearOverlay();
    setStatus('idle');
  }

  /** The one place a decoded code becomes a result: camera and loop both stop. */
  function accept(code: DetectedCode) {
    haltLoop();
    stopStream();
    if (typeof navigator.vibrate === 'function') navigator.vibrate(60);
    setError(null);
    setHit({ rawValue: code.rawValue, format: code.format });
    setStatus('result');
  }

  function scheduleFrame() {
    if (!runningRef.current) return;
    rafRef.current = window.requestAnimationFrame(() => void tick());
  }

  async function tick() {
    rafRef.current = null;
    if (!runningRef.current) return;

    const video = videoRef.current;
    const engine = engineRef.current;
    const grabber = grabberRef.current;
    const now = performance.now();

    if (
      video &&
      engine &&
      grabber &&
      video.readyState >= 2 &&
      now >= nextRunRef.current &&
      now >= cooldownRef.current
    ) {
      nextRunRef.current = now + SCAN_INTERVAL_MS;
      const frame = grabber.grab(video, video.videoWidth, video.videoHeight, SCAN_MAX_FRAME_WIDTH);
      if (frame) {
        frameSizeRef.current = { width: frame.width, height: frame.height };
        try {
          const codes = await engine.detect(frame);
          if (!runningRef.current) return;
          frameErrorsRef.current = 0;
          codesRef.current = codes;
          drawOverlay();
          const pick = largestCode(codes);
          if (pick) {
            accept(pick);
            return;
          }
        } catch {
          // One undecodable frame is normal — a hand shakes, a frame blurs. Ten
          // in a row is a decoder that has stopped working (Chrome on Android
          // can lose its barcode service mid-session), and saying so beats a
          // preview that reads nothing until the visitor gives up.
          frameErrorsRef.current += 1;
          if (frameErrorsRef.current >= SCAN_MAX_FRAME_ERRORS) {
            stopCamera();
            setError(
              'تعذَّر قراءة الرَّمز بكاميرا هذا الجهاز. ارفع صورة تحتوي على الرَّمز بدلًا من ذلك.'
            );
            return;
          }
        }
      }
    }

    scheduleFrame();
  }

  async function startCamera() {
    setError(null);
    setStatus('starting');
    frameErrorsRef.current = 0;

    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus('idle');
      setError('لا يدعم متصفِّحك الوصول إلى الكاميرا هنا. ارفع صورة للرَّمز بدلًا من ذلك.');
      return;
    }

    try {
      // Warm the decoder before the camera opens: on the WASM path the engine
      // still has to be fetched and instantiated, and doing that afterwards
      // drops the first frames on the floor.
      await ensureEngine();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
        audio: false,
      });

      const video = videoRef.current;
      if (disposedRef.current || !video) {
        for (const track of stream.getTracks()) track.stop();
        if (!disposedRef.current) {
          setStatus('idle');
          setError('تعذَّر تجهيز نافذة الكاميرا.');
        }
        return;
      }

      streamRef.current = stream;
      video.srcObject = stream;
      await video.play();

      const capabilities = stream.getVideoTracks()[0]?.getCapabilities?.() as unknown as
        (MediaTrackCapabilities & { torch?: boolean }) | undefined;
      setTorchAvailable(Boolean(capabilities?.torch));
      setTorchOn(false);

      grabberRef.current ??= new FrameGrabber();
      runningRef.current = true;
      nextRunRef.current = 0;
      setStatus('scanning');
      scheduleFrame();
    } catch (caught) {
      haltLoop();
      stopStream();
      setStatus('idle');
      setError(cameraErrorMessage(caught, shellVersionFromUserAgent(navigator.userAgent)));
    }
  }

  function rescan() {
    setHit(null);
    cooldownRef.current = performance.now() + RESCAN_COOLDOWN_MS;
    void startCamera();
  }

  async function toggleTorch() {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as unknown as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setTorchAvailable(false);
    }
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Clear it so picking the same file twice still fires a change event.
    event.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      setError('الملف المختار ليس صورة.');
      return;
    }
    if (file.size > SCAN_MAX_UPLOAD_BYTES) {
      setError('حجم الصُّورة كبير جدًّا. الحد الأقصى ١٢ ميغابايت.');
      return;
    }

    setError(null);
    setBusy(true);
    stopCamera();

    try {
      const engine = await ensureEngine();
      const frame = await imageDataFromFile(file);
      frameSizeRef.current = { width: frame.width, height: frame.height };
      const codes = await engine.detect(frame);
      const pick = largestCode(codes);
      if (!pick) {
        setError('لم نعثر على رمز في هذه الصُّورة. جرِّب صورة أوضح وأقرب للرَّمز.');
        return;
      }
      accept(pick);
    } catch {
      setError('تعذَّر قراءة الصُّورة. تأكَّد أنَّها صورة صالحة.');
    } finally {
      setBusy(false);
    }
  }

  /** A tap picks the box under the finger, which is how several codes are told apart. */
  function handleOverlayClick(event: MouseEvent<HTMLCanvasElement>) {
    const context = currentTransform();
    const overlay = overlayRef.current;
    if (!context || !overlay || codesRef.current.length === 0) return;

    const rect = overlay.getBoundingClientRect();
    const point = displayToFrame(
      context.transform,
      event.clientX - rect.left,
      event.clientY - rect.top
    );
    const picked = codeAtPoint(codesRef.current, point.x, point.y);
    if (picked) accept(picked);
  }

  const scanning = status === 'scanning';

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-10 sm:py-16">
      <p className="sr-only" role="status" aria-live="polite">
        {classification
          ? `تمَّ قراءة الرَّمز. النَّوع: ${SCAN_RESULT_KIND_LABELS[classification.kind]}`
          : ''}
      </p>

      <header className="flex flex-col items-center gap-3 text-center">
        <SectionTitle as="h1">
          <SectionTitleHighlight>ماسح QR و Barcode</SectionTitleHighlight>
        </SectionTitle>
      </header>

      <div className={cn('flex flex-col gap-4', hit && 'hidden')}>
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl border border-border/60 bg-black/90 sm:aspect-video">
              <video
                ref={videoRef}
                playsInline
                muted
                autoPlay
                className={cn('size-full object-cover', scanning ? 'opacity-100' : 'opacity-0')}
              />
              <canvas
                ref={overlayRef}
                onClick={handleOverlayClick}
                className={cn(
                  'absolute inset-0 size-full',
                  scanning ? 'cursor-crosshair' : 'hidden'
                )}
              />

              {!scanning && (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center">
                  <ScanBarcode className="size-12 text-white/80" />
                  <Button
                    type="button"
                    onClick={() => void startCamera()}
                    disabled={status === 'starting' || busy}
                  >
                    {status === 'starting' ? <Loader2 className="animate-spin" /> : <Camera />}
                    {status === 'starting' ? 'جاري تشغيل الكاميرا…' : 'تشغيل الكاميرا'}
                  </Button>
                </div>
              )}

              {scanning && (
                <div className="absolute inset-x-0 bottom-0 z-10 flex items-center justify-between gap-2 bg-linear-to-t from-black/75 to-transparent p-3">
                  <p className="text-xs text-white/80" aria-live="polite">
                    وجِّه الرَّمز داخل الإطار…
                  </p>
                  <div className="flex items-center gap-2">
                    {torchAvailable && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="icon-sm"
                        aria-label={torchOn ? 'إطفاء الكشَّاف' : 'تشغيل الكشَّاف'}
                        onClick={() => void toggleTorch()}
                      >
                        {torchOn ? <FlashlightOff /> : <Flashlight />}
                      </Button>
                    )}
                    <Button type="button" variant="secondary" size="sm" onClick={stopCamera}>
                      <Square className="size-3.5" />
                      إيقاف
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <p
                role="alert"
                className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
              >
                {error}
              </p>
            )}

            <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border/70 p-4 text-center">
              <p className="text-xs text-muted-foreground">أو ارفع صورة تحتوي على الرَّمز</p>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="sr-only"
                aria-label="اختيار صورة تحتوي على رمز"
                onChange={(event) => void handleFile(event)}
              />
              <Button
                type="button"
                variant="outline"
                disabled={busy || status === 'starting'}
                onClick={() => fileRef.current?.click()}
              >
                {busy ? <Loader2 className="animate-spin" /> : <Upload />}
                {busy ? 'جاري القراءة…' : 'اختيار صورة'}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      {hit && classification && (
        <ScanResultCard
          classification={classification}
          formatLabel={formatLabel}
          certificate={certificate}
          onRescan={rescan}
        />
      )}
    </div>
  );
}
