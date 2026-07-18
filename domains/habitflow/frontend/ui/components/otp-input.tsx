'use client';

import { useRef, useEffect, useCallback } from 'react';

interface OtpInputProps {
  length?: number;
  disabled?: boolean;
  value?: string;
  onChange?: (otp: string) => void;
  onComplete: (otp: string) => void;
}

export default function OtpInput({
  length = 6,
  disabled,
  value,
  onChange,
  onComplete,
}: OtpInputProps) {
  const digits = value
    ? value.padEnd(length, ' ').slice(0, length).split('')
    : Array(length).fill('');
  const internalOtp = useRef<string[]>(value ? digits : Array(length).fill(''));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const completedRef = useRef(false);

  const otp = value !== undefined ? digits : internalOtp.current;

  const focusIndex = useCallback(
    (index: number) => {
      if (index >= 0 && index < length) {
        inputRefs.current[index]?.focus();
      }
    },
    [length]
  );

  useEffect(() => {
    focusIndex(0);
  }, [focusIndex]);

  function emitChange(newOtp: string[]) {
    const full = newOtp.join('');
    onChange?.(full);
    if (full.length === length && !completedRef.current) {
      completedRef.current = true;
      onComplete(full);
    }
    if (full.length < length) {
      completedRef.current = false;
    }
  }

  function updateDigit(index: number, digit: string, arr: string[]) {
    const copy = [...arr];
    copy[index] = digit;
    return copy;
  }

  function handleChange(index: number, input: string) {
    if (!/^\d*$/.test(input)) return;

    const digit = input.slice(-1);
    const newOtp = updateDigit(index, digit, otp);
    if (value === undefined) {
      internalOtp.current = newOtp;
    }

    if (digit && index < length - 1) {
      focusIndex(index + 1);
    }

    emitChange(newOtp);
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent) {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      const newOtp = updateDigit(index - 1, '', otp);
      if (value === undefined) {
        internalOtp.current = newOtp;
      }
      emitChange(newOtp);
      focusIndex(index - 1);
    }
    if (e.key === 'ArrowLeft' && index > 0) focusIndex(index - 1);
    if (e.key === 'ArrowRight' && index < length - 1) focusIndex(index + 1);
  }

  function handlePaste(e: React.ClipboardEvent) {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length);
    const newOtp = Array(length).fill('');
    for (let i = 0; i < pasted.length; i++) {
      newOtp[i] = pasted[i];
    }
    if (value === undefined) {
      internalOtp.current = newOtp;
    }
    const nextIndex = Math.min(pasted.length, length - 1);
    focusIndex(nextIndex);
    emitChange(newOtp);
  }

  return (
    <div className="flex gap-2 justify-center" dir="ltr">
      {Array.from({ length }, (_, i) => (
        <input
          key={i}
          ref={(el) => {
            inputRefs.current[i] = el;
          }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={otp[i] === ' ' ? '' : otp[i]}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={i === 0 ? handlePaste : undefined}
          disabled={disabled}
          className="w-12 h-14 text-center text-xl font-bold rounded-xl border border-input bg-background text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 transition-all duration-200 disabled:opacity-50"
        />
      ))}
    </div>
  );
}
