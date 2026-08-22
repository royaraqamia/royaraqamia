'use client';

import { Toaster } from 'sonner';
import { CheckCircle2, CircleAlert, CircleX, Info, LoaderCircle, X } from 'lucide-react';

export function RoyaToasterCore() {
  return (
    <Toaster
      position="top-center"
      dir="rtl"
      theme="dark"
      richColors
      closeButton
      duration={5000}
      gap={10}
      visibleToasts={4}
      offset={{ top: 88 }}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast: 'group toast',
          actionButton:
            'group-[.toast]:bg-neutral-100 group-[.toast]:text-neutral-950 group-[.toast]:font-semibold group-[.toast]:rounded-lg group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-xs group-[.toast]:transition-[background-color,transform] group-[.toast]:duration-200 hover:group-[.toast]:bg-white active:group-[.toast]:scale-95 focus-visible:group-[.toast]:outline-none focus-visible:group-[.toast]:ring-2 focus-visible:group-[.toast]:ring-neutral-400/50',
          cancelButton:
            'group-[.toast]:bg-neutral-800 group-[.toast]:text-neutral-300 group-[.toast]:font-medium group-[.toast]:rounded-lg group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-xs group-[.toast]:transition-[background-color,transform] group-[.toast]:duration-200 hover:group-[.toast]:bg-neutral-700 active:group-[.toast]:scale-95 focus-visible:group-[.toast]:outline-none focus-visible:group-[.toast]:ring-2 focus-visible:group-[.toast]:ring-neutral-400/50',
        },
      }}
      icons={{
        success: <CheckCircle2 aria-hidden="true" className="h-4 w-4" />,
        info: <Info aria-hidden="true" className="h-4 w-4" />,
        warning: <CircleAlert aria-hidden="true" className="h-4 w-4" />,
        error: <CircleX aria-hidden="true" className="h-4 w-4" />,
        loading: <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />,
        close: <X aria-hidden="true" className="h-3.5 w-3.5" />,
      }}
    />
  );
}
