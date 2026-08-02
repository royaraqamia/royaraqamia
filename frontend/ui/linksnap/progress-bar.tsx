'use client';

import { useEffect, useState } from 'react';

export function ProgressBar() {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setTimeout(() => setVisible(false), 400);
    return () => clearTimeout(id);
  }, []);

  if (!visible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-100 h-0.5">
      <div className="h-full bg-linear-to-l from-primary via-accent to-primary animate-progress-bar" />
    </div>
  );
}
