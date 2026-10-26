'use client';

import { UserRound } from 'lucide-react';

import { type Testimonial } from '../../data/testimonials';
import { getTestimonialMeta, VerifiedBadge } from './testimonials-meta';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogScrollArea,
  DialogTitle,
} from './primitives/dialog';

interface TestimonialReviewDialogProps {
  /** The review to expand; `null` while the dialog is closed mid-animation. */
  review: Testimonial | null;
  open: boolean;
  onClose: () => void;
}

/**
 * The expanded testimonial, split out of the carousel so the dialog primitive
 * (portal, focus scope, scroll lock) stays out of the homepage's initial graph.
 *
 * It is mounted on the first open and kept mounted afterwards: unmounting on
 * close would cut the primitive's exit animation short.
 */
export function TestimonialReviewDialog({ review, open, onClose }: TestimonialReviewDialogProps) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        hideClose
        className="p-0 gap-0 sm:max-w-xl border border-white/15 bg-neutral-900 text-slate-100 grid-rows-[minmax(0,1fr)] overflow-hidden"
      >
        {/* Mobile Handle Indicator */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-12 h-1.5 bg-white/20 rounded-full sm:hidden" />

        {review && (
          <DialogScrollArea className="p-6 sm:p-8 flex flex-col justify-between">
            <DialogTitle className="sr-only">تقييم من {review.name}</DialogTitle>
            <DialogDescription className="sr-only">
              التَّقييم الكامل من {review.name}
            </DialogDescription>

            {/* Expanded Review Content */}
            <div className="my-6 relative">
              <p className="text-base sm:text-lg text-slate-100 leading-relaxed font-normal whitespace-pre-line select-text">
                {review.content}
              </p>
            </div>

            {/* Detailed Author Profile Footer */}
            <div className="flex items-center justify-between gap-4 pt-5 border-t border-white/10">
              <div className="flex items-center gap-4 min-w-0">
                <div
                  className={`
                    w-12 h-12 sm:w-13 sm:h-13 rounded-full 
                    bg-linear-to-tr ${getTestimonialMeta(review.name).gradient}
                    flex items-center justify-center 
                    text-white font-bold text-base sm:text-lg 
                    ring-2 ring-white/20 shrink-0
                  `}
                >
                  {getTestimonialMeta(review.name).initials || <UserRound className="w-5 h-5" />}
                </div>

                <div className="flex flex-col min-w-0">
                  <h3 className="font-bold text-base sm:text-lg text-white truncate">
                    {review.name}
                  </h3>
                </div>
              </div>

              <VerifiedBadge label="مُوثَّق" />
            </div>
          </DialogScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}
