'use client';

import { useEffect, useState } from 'react';

export function ReadingProgress({ targetId }: { targetId?: string }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let ticking = false;
    const handleScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        ticking = false;
        const target = targetId ? document.getElementById(targetId) : null;
        if (target) {
          const rect = target.getBoundingClientRect();
          const total = rect.height - window.innerHeight;
          const pct = total > 0 ? (-rect.top / total) * 100 : 0;
          setProgress(Math.min(Math.max(pct, 0), 100));
        } else {
          const scrollTop = window.scrollY;
          const docHeight = document.documentElement.scrollHeight - window.innerHeight;
          const pct = docHeight > 0 ? (scrollTop / docHeight) * 100 : 0;
          setProgress(Math.min(Math.max(pct, 0), 100));
        }
      });
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => window.removeEventListener('scroll', handleScroll);
  }, [targetId]);

  return (
    <div className="fixed top-0 left-0 right-0 z-60 h-0.75 bg-transparent pointer-events-none">
      <div
        className="h-full bg-linear-to-l from-primary via-primary/80 to-primary/40 transition-[width] duration-150 ease-out"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}
