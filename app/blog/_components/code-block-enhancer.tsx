'use client';

import { useEffect, useRef } from 'react';

export function CodeBlockEnhancer() {
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const addButtons = () => {
      document.querySelectorAll('pre').forEach((pre) => {
        if (pre.querySelector('.code-copy-btn')) return;

        const btn = document.createElement('button');
        btn.className =
          'code-copy-btn absolute top-2 right-2 size-8 rounded-lg bg-background/80 border border-border/50 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-background transition-all opacity-0 group-hover:opacity-100 z-10 cursor-pointer';
        btn.setAttribute('aria-label', 'نسخ الكود');
        btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;

        btn.onclick = async (e) => {
          e.stopPropagation();
          const code = pre.querySelector('code')?.textContent || '';
          try {
            await navigator.clipboard.writeText(code);
            btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" color="#22c55e"><polyline points="20 6 9 17 4 12"/></svg>`;
            setTimeout(() => {
              btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`;
            }, 2000);
          } catch {
            /* ignore */
          }
        };

        pre.style.position = 'relative';
        pre.classList.add('group');
        pre.appendChild(btn);
      });
    };

    addButtons();
    const observer = new MutationObserver(addButtons);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => observer.disconnect();
  }, []);

  return null;
}
