'use client';

import { useRef, useState, useEffect } from 'react';
import Image from 'next/image';
import { Dialog, DialogContent, DialogTitle, DialogDescription } from '@/frontend/ui/primitives/dialog';
import { projectImages, projectData, visibleIndices, PORTFOLIO_IMAGES } from './portfolio-data';

type GalleryIndexUpdater = React.Dispatch<React.SetStateAction<number>>;

interface PortfolioGalleryDialogProps {
  selectedProject: number | null;
  galleryIndex: number;
  onGalleryIndexChange: GalleryIndexUpdater;
  onClose: () => void;
}

export function PortfolioGalleryDialog({
  selectedProject,
  galleryIndex,
  onGalleryIndexChange,
  onClose,
}: PortfolioGalleryDialogProps) {
  const [zoom, setZoom] = useState({ scale: 1, x: 0, y: 0 });
  const [galleryImageError, setGalleryImageError] = useState(false);
  const imageContainerRef = useRef<HTMLDivElement>(null);
  const touchStartRef = useRef<{
    x: number;
    y: number;
    time: number;
    baseX: number;
    baseY: number;
  } | null>(null);
  const lastTapRef = useRef<number>(0);
  const pinchRef = useRef<{ dist: number; scale: number } | null>(null);
  const pinchRAFRef = useRef<number | null>(null);
  const pinchScaleRef = useRef(1);

  useEffect(() => {
    setZoom({ scale: 1, x: 0, y: 0 });
    setGalleryImageError(false);
  }, [selectedProject]);

  useEffect(() => {
    setZoom({ scale: 1, x: 0, y: 0 });
    setGalleryImageError(false);
  }, [galleryIndex]);

  const setGalleryIndex = onGalleryIndexChange;

  return (
    <Dialog open={selectedProject !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-4xl w-[calc(100%-32px)] p-0 rounded-3xl bg-[#080c16]/95 border border-white/15 backdrop-blur-2xl shadow-2xl shadow-purple-950/50 overflow-y-auto dialog-scrollbar max-md:max-h-[80dvh] max-md:my-auto">
        {selectedProject !== null &&
          (() => {
            const project = projectData[selectedProject]!;
            const images = projectImages[selectedProject] ?? [PORTFOLIO_IMAGES[selectedProject]!];
            const currentImage = images[galleryIndex]!;
            const hasMultipleImages = images.length > 1;

            const goToPrev = () =>
              setGalleryIndex((prev: number) => (prev > 0 ? prev - 1 : images.length - 1));
            const goToNext = () =>
              setGalleryIndex((prev: number) => (prev < images.length - 1 ? prev + 1 : 0));

            const zoomed = zoom.scale > 1;

            const handleTouchStart = (e: React.TouchEvent) => {
              if (e.touches.length === 1) {
                const t = e.touches[0]!;
                touchStartRef.current = {
                  x: t.clientX,
                  y: t.clientY,
                  time: Date.now(),
                  baseX: zoom.x,
                  baseY: zoom.y,
                };
              } else if (e.touches.length === 2 && zoomed) {
                const t0 = e.touches[0]!;
                const t1 = e.touches[1]!;
                const dx = t0.clientX - t1.clientX;
                const dy = t0.clientY - t1.clientY;
                pinchRef.current = {
                  dist: Math.sqrt(dx * dx + dy * dy),
                  scale: zoom.scale,
                };
              }
            };

            const handleTouchMove = (e: React.TouchEvent) => {
              if (e.touches.length === 2 && pinchRef.current && zoomed) {
                e.preventDefault();
                const t0 = e.touches[0]!;
                const t1 = e.touches[1]!;
                const dx = t0.clientX - t1.clientX;
                const dy = t0.clientY - t1.clientY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const newScale = Math.max(
                  1,
                  Math.min(5, pinchRef.current.scale * (dist / pinchRef.current.dist))
                );
                pinchScaleRef.current = newScale;
                if (pinchRAFRef.current === null) {
                  pinchRAFRef.current = requestAnimationFrame(() => {
                    pinchRAFRef.current = null;
                    setZoom((prev) => ({ ...prev, scale: pinchScaleRef.current }));
                  });
                }
              } else if (e.touches.length === 1 && touchStartRef.current && zoomed) {
                const ts = touchStartRef.current;
                const t = e.touches[0]!;
                const dx = t.clientX - ts.x;
                const dy = t.clientY - ts.y;
                setZoom((prev) => ({
                  ...prev,
                  x: ts.baseX + dx,
                  y: ts.baseY + dy,
                }));
              }
            };

            const handleTouchEnd = (e: React.TouchEvent) => {
              if (e.changedTouches.length === 1 && touchStartRef.current) {
                const ct = e.changedTouches[0]!;
                const dx = ct.clientX - touchStartRef.current.x;
                const dy = ct.clientY - touchStartRef.current.y;
                const dt = Date.now() - touchStartRef.current.time;
                const absDx = Math.abs(dx);
                const absDy = Math.abs(dy);

                if (!zoomed && absDx > 50 && absDx > absDy * 2) {
                  if (dx < 0) goToNext();
                  else goToPrev();
                  touchStartRef.current = null;
                  pinchRef.current = null;
                  return;
                }

                if (absDx < 10 && absDy < 10 && dt < 300) {
                  const now = Date.now();
                  if (now - lastTapRef.current < 300 && now - lastTapRef.current > 50) {
                    setZoom((prev) =>
                      prev.scale > 1 ? { scale: 1, x: 0, y: 0 } : { scale: 2.5, x: 0, y: 0 }
                    );
                    lastTapRef.current = 0;
                    touchStartRef.current = null;
                    pinchRef.current = null;
                    return;
                  }
                  lastTapRef.current = now;
                }
              }
              if (pinchRAFRef.current !== null) {
                cancelAnimationFrame(pinchRAFRef.current);
                pinchRAFRef.current = null;
                setZoom((prev) => ({ ...prev, scale: pinchScaleRef.current }));
              }
              touchStartRef.current = null;
              pinchRef.current = null;
            };

            return (
              <div className="flex flex-col h-full">
                <div
                  ref={imageContainerRef}
                  className={`flex-1 min-h-0 flex items-center justify-center bg-linear-to-b from-purple-900/10 via-black/20 to-black/40 max-md:px-0 max-md:pt-0 p-4 sm:p-8 relative ${
                    zoomed
                      ? 'overflow-auto touch-action-none'
                      : 'overflow-hidden touch-action-manipulation'
                  }`}
                  onTouchStart={handleTouchStart}
                  onTouchMove={handleTouchMove}
                  onTouchEnd={handleTouchEnd}
                >
                  <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.08)_0,transparent_70%)] pointer-events-none" />
                  {galleryImageError ? (
                    <div className="flex flex-col items-center justify-center text-slate-500 z-10 gap-3">
                      <svg
                        className="w-16 h-16 opacity-40"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={1}
                          d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                        />
                      </svg>
                      <span className="text-sm">تعذر تحميل الصورة</span>
                    </div>
                  ) : (
                    <Image
                      key={galleryIndex}
                      src={currentImage.webp}
                      alt={project.title}
                      width={1600}
                      height={1152}
                      unoptimized
                      className={`rounded-2xl shadow-2xl relative z-10 select-none ${
                        zoomed
                          ? 'max-w-none max-h-none'
                          : 'max-h-full max-w-full object-contain w-auto h-auto max-md:w-full'
                      }`}
                      style={
                        zoomed
                          ? {
                              transform: `translate(${zoom.x}px, ${zoom.y}px) scale(${zoom.scale})`,
                              transformOrigin: 'center center',
                            }
                          : undefined
                      }
                      draggable={false}
                      onError={() => setGalleryImageError(true)}
                      sizes="(max-width: 768px) 100vw, 900px"
                    />
                  )}
                  {zoomed && (
                    <button
                      onClick={() => setZoom({ scale: 1, x: 0, y: 0 })}
                      className="absolute top-4 right-4 z-30 w-9 h-9 rounded-full flex items-center justify-center bg-black/60 backdrop-blur-md border border-white/20 text-white hover:bg-purple-600/70 transition-all duration-300"
                      aria-label="إعادة تعيين التكبير"
                      type="button"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M6 18L18 6M6 6l12 12"
                        />
                      </svg>
                    </button>
                  )}
                  {hasMultipleImages && !zoomed && (
                    <>
                      <button
                        onClick={goToPrev}
                        className="absolute inset-s-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full flex items-center justify-center bg-black/50 backdrop-blur-md border border-white/15 text-white hover:bg-purple-600/70 hover:border-purple-500/50 transition-all duration-300"
                        aria-label="السابق"
                        type="button"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </button>
                      <button
                        onClick={goToNext}
                        className="absolute inset-e-4 top-1/2 -translate-y-1/2 z-20 w-10 h-10 rounded-full flex items-center justify-center bg-black/50 backdrop-blur-md border border-white/15 text-white hover:bg-purple-600/70 hover:border-purple-500/50 transition-all duration-300"
                        aria-label="التالي"
                        type="button"
                      >
                        <svg
                          className="w-5 h-5"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M15 19l-7-7 7-7"
                          />
                        </svg>
                      </button>
                      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2">
                        {images.map((_, imgIdx) => (
                          <button
                            key={imgIdx}
                            onClick={() => setGalleryIndex(imgIdx)}
                            className={`w-2 h-2 rounded-full transition-all duration-300 ${
                              imgIdx === galleryIndex
                                ? 'bg-purple-400 w-5'
                                : 'bg-white/30 hover:bg-white/60'
                            }`}
                            aria-label={`الصورة ${imgIdx + 1}`}
                            type="button"
                          />
                        ))}
                      </div>
                    </>
                  )}
                </div>
                <div className="p-6 sm:p-8 pt-5 sm:pt-6 shrink-0 bg-[#080c16] border-t border-white/10">
                  <div className="flex items-center gap-3 mb-3">
                    <span className="px-3 py-1 text-xs font-medium rounded-full bg-purple-500/10 text-purple-300 border border-purple-500/20">
                      {project.category || 'مشروع رقمي'}
                    </span>
                    <span className="text-xs font-mono text-slate-500">
                      #{(visibleIndices.indexOf(selectedProject) + 1).toString().padStart(2, '0')}
                    </span>
                  </div>
                  <DialogTitle className="text-2xl sm:text-3xl font-black text-white mb-3 tracking-tight">
                    {project.title}
                  </DialogTitle>
                  {project.description && (
                    <DialogDescription className="text-slate-300 text-sm sm:text-base leading-relaxed max-w-3xl">
                      {project.description}
                    </DialogDescription>
                  )}
                </div>
              </div>
            );
          })()}
      </DialogContent>
    </Dialog>
  );
}
