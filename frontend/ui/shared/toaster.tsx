'use client';

import { Toaster } from 'sonner';
import { CheckCircle2, CircleAlert, CircleX, Info, LoaderCircle, X } from 'lucide-react';

export function RoyaToaster() {
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
      icons={{
        success: <CheckCircle2 aria-hidden="true" />,
        info: <Info aria-hidden="true" />,
        warning: <CircleAlert aria-hidden="true" />,
        error: <CircleX aria-hidden="true" />,
        loading: <LoaderCircle aria-hidden="true" className="animate-spin" />,
        close: <X aria-hidden="true" />,
      }}
    />
  );
}
