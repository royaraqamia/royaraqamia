'use client';

import Image from 'next/image';
import { Sun, Moon } from 'lucide-react';
import { useState, useEffect, useRef, type ReactNode } from 'react';
import Link from 'next/link';
interface HeaderProps {
  rightContent?: ReactNode;
}

export function Header({ rightContent }: HeaderProps) {
  const [scrolled, setScrolled] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);

  useEffect(() => {
    const sentinel = document.createElement('div');
    sentinel.className = 'h-px w-full absolute top-0 left-0 pointer-events-none';
    document.body.prepend(sentinel);
    observerRef.current = new IntersectionObserver(
      ([entry]) => setScrolled(!entry?.isIntersecting),
      { threshold: 0 }
    );
    observerRef.current.observe(sentinel);
    return () => {
      observerRef.current?.disconnect();
      sentinel.remove();
    };
  }, []);

  const toggleTheme = () => {
    const isDark = document.documentElement.classList.contains('dark');
    const next = isDark ? 'light' : 'dark';
    localStorage.setItem('theme', next);
    document.documentElement.classList.toggle('dark');
  };

  return (
    <header
      className={`sticky top-0 z-10 w-full bg-background/80 backdrop-blur-xl border-b px-6 py-4 transition-shadow duration-200 ${
        scrolled ? 'shadow-[var(--shadow-card)] border-border' : 'border-transparent'
      }`}
    >
      <div className="absolute inset-0 pointer-events-none rounded-[inherit] border-b border-white/[0.04] dark:border-white/[0.06]"></div>
      <div className="max-w-6xl mx-auto flex flex-row items-center justify-between gap-2 sm:gap-4">
        <Link href="/" className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl overflow-hidden shadow-sm">
            <Image
              src="/logo.webp"
              alt="HabitFlow"
              width={40}
              height={40}
              className="w-full h-full object-cover"
            />
          </div>
          <div>
            <h1 className="text-[clamp(1.125rem,2.5vw,1.5rem)] font-bold tracking-tight text-foreground font-sans leading-none">
              HabitFlow
            </h1>
          </div>
        </Link>

        <div className="flex items-center gap-3 flex-wrap">
          <button
            onClick={toggleTheme}
            className="p-2 rounded-xl transition-all duration-200 ease-out bg-muted text-muted-foreground hover:bg-accent active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            aria-label="تبديل السمة"
          >
            <Sun className="w-4 h-4 dark:hidden" />
            <Moon className="w-4 h-4 hidden dark:block" />
          </button>

          {rightContent}
        </div>
      </div>
    </header>
  );
}
