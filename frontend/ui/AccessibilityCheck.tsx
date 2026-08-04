'use client';

import { useEffect } from 'react';
import { IS_DEVELOPMENT } from '@/frontend/shared/constants';

export function AccessibilityCheck() {
  useEffect(() => {
    if (!IS_DEVELOPMENT) return;
    const run = async () => {
      try {
        const React = await import('react');
        const ReactDOM = await import('react-dom');
        const axe = await import('@axe-core/react');
        axe.default(React.default, ReactDOM.default, 1000);
      } catch {
        // axe-core unavailable — skip
      }
    };
    run();
  }, []);
  return null;
}
