'use client';

import { useRef, useEffect } from 'react';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { scrollToSection, scrollToSectionAfterNavigation } from '@/frontend/shared/scroll';

/**
 * The only interactive part of the Footer: the brand button that scrolls back
 * to the homepage hero. Kept as a client island so `Footer` itself can stay a
 * server component.
 */
export function FooterLogoButton() {
  const pathname = usePathname();
  const router = useRouter();
  const scrollCancelRef = useRef<{ cancel: () => void } | null>(null);

  useEffect(() => {
    return () => {
      scrollCancelRef.current?.cancel();
    };
  }, []);

  const scrollToHero = () => {
    scrollCancelRef.current?.cancel();

    if (pathname !== '/') {
      scrollCancelRef.current = scrollToSectionAfterNavigation('home', () => router.push('/'));
    } else {
      scrollToSection('home');
    }
  };

  return (
    <button
      type="button"
      onClick={scrollToHero}
      className="group relative inline-flex items-center gap-2.5 p-1.5 rounded-2xl transition-[background-color,transform] duration-300 hover:bg-accent/40 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background cursor-pointer min-h-11"
      aria-label="العودة إلى الصفحة الرئيسية"
    >
      <Image
        src="/logo.webp"
        alt=""
        width={48}
        height={48}
        className="h-12 w-12 object-contain rounded-full transition-transform duration-500 group-hover:scale-110"
      />

      <span className="logo-text font-heading font-bold text-3xl sm:text-3xl text-primary tracking-tight transition-opacity duration-300 group-hover:opacity-90">
        رؤية رقمية
      </span>
    </button>
  );
}
