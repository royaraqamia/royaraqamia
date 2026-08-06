'use client';

import { useRef, useState, useCallback, useEffect } from 'react';
import { motion } from 'motion/react';

interface OtpInputProps {
  length?: number;
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  disabled?: boolean;
  hasError?: boolean;
}

export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  disabled,
  hasError,
}: OtpInputProps) {
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);

  const handleChange = useCallback(
    (index: number, digit: string) => {
      if (!/^\d*$/.test(digit)) return;

      const newValue = value.split('');
      newValue[index] = digit;
      const result = newValue.join('').slice(0, length);
      onChange(result);

      if (result.length === length) {
        onComplete?.(result);
      }

      if (digit && index < length - 1) {
        inputRefs.current[index + 1]?.focus();
      }
    },
    [value, length, onChange, onComplete]
  );

  const handleKeyDown = useCallback(
    (index: number, e: React.KeyboardEvent) => {
      if (e.key === 'Backspace' && !value[index] && index > 0) {
        inputRefs.current[index - 1]?.focus();
      }
    },
    [value]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent) => {
      e.preventDefault();
      const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
      onChange(pasted);
      inputRefs.current[Math.min(pasted.length, length - 1)]?.focus();
      if (pasted.length === length) {
        onComplete?.(pasted);
      }
    },
    [length, onChange, onComplete]
  );

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  return (
    <div
      className="flex items-center justify-center gap-1.5 min-[380px]:gap-2 sm:gap-3 w-full max-w-full py-2 select-none"
      dir="ltr"
      role="group"
      aria-label="One-time password input"
    >
      {Array.from({ length }, (_, i) => {
        const isFocused = focusedIndex === i;
        const isFilled = value[i] !== undefined && value[i] !== '';

        return (
          <motion.div
            key={i}
            animate={
              hasError && !isFocused
                ? {
                    x: [0, -6, 6, -4, 4, -2, 2, 0],
                    transition: { duration: 0.45, ease: 'easeInOut' },
                  }
                : {
                    scale: isFocused ? 1.04 : 1,
                    transition: { duration: 0.2, ease: [0.16, 1, 0.3, 1] },
                  }
            }
            className="relative flex items-center justify-center shrink-0"
          >
            <input
              ref={(el) => {
                inputRefs.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              autoComplete="one-time-code"
              aria-label={`Digit ${i + 1} of ${length}`}
              aria-invalid={hasError}
              aria-disabled={disabled}
              value={value[i] ?? ''}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              onFocus={() => setFocusedIndex(i)}
              onBlur={() => setFocusedIndex(null)}
              disabled={disabled}
              className={`
                w-10 h-12 min-[380px]:w-12 min-[380px]:h-14 sm:w-14 sm:h-16
                text-center font-mono font-semibold text-xl sm:text-2xl tabular-nums tracking-widest
                rounded-xl sm:rounded-2xl border-2 outline-none backdrop-blur-md
                transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
                disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none
                ${
                  hasError && !isFocused
                    ? 'border-destructive/80 bg-destructive/10 text-destructive shadow-[0_0_15px_-2px_rgba(239,68,68,0.25)]'
                    : isFocused
                      ? 'border-primary bg-background text-foreground ring-4 ring-primary/20 shadow-lg z-10'
                      : isFilled
                        ? 'border-primary/50 bg-primary/3 text-foreground shadow-xs'
                        : 'border-border/60 bg-muted/30 hover:border-foreground/20 hover:bg-muted/60 text-foreground/90'
                }
              `}
            />

            {/* Active slot indicator pill */}
            {isFocused && (
              <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 w-3.5 h-0.5 rounded-full bg-primary animate-pulse pointer-events-none z-20" />
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
