import { useState, useEffect, useRef } from 'react';

export function useAnimatedCounter(target: number, duration = 600): number {
  const [value, setValue] = useState(target);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const initialSetRef = useRef(false);

  useEffect(() => {
    initialSetRef.current = false;
    startTimeRef.current = null;

    const animate = (timestamp: number) => {
      if (!initialSetRef.current) {
        setValue(0);
        initialSetRef.current = true;
      }

      if (startTimeRef.current === null) {
        startTimeRef.current = timestamp;
      }

      const elapsed = timestamp - startTimeRef.current;
      const progress = Math.min(elapsed / duration, 1);

      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.round(eased * target));

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(animate);
      }
    };

    rafRef.current = requestAnimationFrame(animate);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [target, duration]);

  return value;
}
