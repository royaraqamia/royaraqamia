'use client';

import { Toaster } from 'sonner';
import { CheckCircle2, CircleAlert, CircleX, Info, LoaderCircle, X } from 'lucide-react';

export function RoyaToaster() {
  return (
    <>
      <style>{`
        /* ============================================================
           Toasts — «رؤية رقمية» Design Restyle (Sonner Overrides)
           Specificity scoped under [data-sonner-theme='dark']
           ============================================================ */

        /* ---- Theme palettes (drives sonner internal variables) ---- */
        html [data-sonner-toaster][data-sonner-theme='dark'] {
          --normal-bg: hsl(var(--card, 222.2 84% 4.9%) / 0.82);
          --normal-bg-hover: hsl(var(--card, 222.2 84% 4.9%) / 0.95);
          --normal-border: hsl(var(--border, 217.2 32.6% 17.5%) / 0.6);
          --normal-text: hsl(var(--foreground, 210 40% 98%));

          --success-bg: hsl(var(--success, 142.1 70.6% 45.3%) / 0.12);
          --success-border: hsl(var(--success, 142.1 70.6% 45.3%) / 0.45);
          --success-text: hsl(var(--success, 142.1 70.6% 45.3%));

          --info-bg: hsl(var(--info, 198.9 88.7% 48.4%) / 0.12);
          --info-border: hsl(var(--info, 198.9 88.7% 48.4%) / 0.45);
          --info-text: hsl(var(--info, 198.9 88.7% 48.4%));

          --warning-bg: hsl(var(--warning, 37.7 92.1% 50.2%) / 0.12);
          --warning-border: hsl(var(--warning, 37.7 92.1% 50.2%) / 0.45);
          --warning-text: hsl(var(--warning, 37.7 92.1% 50.2%));

          --error-bg: hsl(var(--destructive, 0 84.2% 60.2%) / 0.12);
          --error-border: hsl(var(--destructive, 0 84.2% 60.2%) / 0.45);
          --error-text: hsl(var(--destructive, 0 84.2% 60.2%));

          font-family: var(--font-sans, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif);
        }

        /* Glass Card Shell */
        html [data-sonner-toaster][data-sonner-theme='dark'] [data-sonner-toast][data-styled='true'] {
          background: hsl(var(--card, 222.2 84% 4.9%) / 0.82);
          backdrop-filter: blur(20px) saturate(160%);
          -webkit-backdrop-filter: blur(20px) saturate(160%);
          border: 1px solid hsl(var(--border, 217.2 32.6% 17.5%) / 0.65);
          border-radius: var(--radius-xl, 1rem);
          box-shadow: 
            0 20px 30px -10px rgba(0, 0, 0, 0.5),
            0 10px 15px -5px rgba(0, 0, 0, 0.3),
            inset 0 1px 0 0 rgba(255, 255, 255, 0.08);
          color: hsl(var(--foreground, 210 40% 98%));
          font-family: var(--font-sans, system-ui, sans-serif);
          padding: 14px 16px;
          gap: 12px;
          transition: transform 250ms cubic-bezier(0.16, 1, 0.3, 1), opacity 250ms cubic-bezier(0.16, 1, 0.3, 1);
        }

        /* Direction-Aware Accent Strip (RTL Right / LTR Left) */
        html [data-sonner-toaster][data-sonner-theme='dark'] [data-sonner-toast][data-type='success'][data-styled='true'] {
          border-inline-start: 3px solid hsl(var(--success, 142.1 70.6% 45.3%));
        }
        html [data-sonner-toaster][data-sonner-theme='dark'] [data-sonner-toast][data-type='info'][data-styled='true'] {
          border-inline-start: 3px solid hsl(var(--info, 198.9 88.7% 48.4%));
        }
        html [data-sonner-toaster][data-sonner-theme='dark'] [data-sonner-toast][data-type='warning'][data-styled='true'] {
          border-inline-start: 3px solid hsl(var(--warning, 37.7 92.1% 50.2%));
        }
        html [data-sonner-toaster][data-sonner-theme='dark'] [data-sonner-toast][data-type='error'][data-styled='true'] {
          border-inline-start: 3px solid hsl(var(--destructive, 0 84.2% 60.2%));
        }
        html [data-sonner-toaster][data-sonner-theme='dark'] [data-sonner-toast][data-type='default'][data-styled='true'],
        html [data-sonner-toaster][data-sonner-theme='dark'] [data-sonner-toast][data-type='loading'][data-styled='true'] {
          border-inline-start: 3px solid hsl(var(--primary, 217.2 91.2% 59.8%));
        }

        /* Icon Container Chip */
        html [data-sonner-toaster][data-sonner-theme='dark'] [data-sonner-toast][data-styled='true'] [data-icon] {
          width: 26px;
          height: 26px;
          margin: 0;
          border-radius: var(--radius-sm, 0.375rem);
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        html [data-sonner-toaster][data-sonner-theme='dark'] [data-sonner-toast][data-styled='true'] [data-icon] svg {
          width: 16px;
          height: 16px;
        }
        html [data-sonner-toaster][data-sonner-theme='dark'] [data-sonner-toast][data-type='success'][data-styled='true'] [data-icon] {
          background: hsl(var(--success, 142.1 70.6% 45.3%) / 0.14);
          color: hsl(var(--success, 142.1 70.6% 45.3%));
        }
        html [data-sonner-toaster][data-sonner-theme='dark'] [data-sonner-toast][data-type='info'][data-styled='true'] [data-icon] {
          background: hsl(var(--info, 198.9 88.7% 48.4%) / 0.14);
          color: hsl(var(--info, 198.9 88.7% 48.4%));
        }
        html [data-sonner-toaster][data-sonner-theme='dark'] [data-sonner-toast][data-type='warning'][data-styled='true'] [data-icon] {
          background: hsl(var(--warning, 37.7 92.1% 50.2%) / 0.14);
          color: hsl(var(--warning, 37.7 92.1% 50.2%));
        }
        html [data-sonner-toaster][data-sonner-theme='dark'] [data-sonner-toast][data-type='error'][data-styled='true'] [data-icon] {
          background: hsl(var(--destructive, 0 84.2% 60.2%) / 0.14);
          color: hsl(var(--destructive, 0 84.2% 60.2%));
        }
        html [data-sonner-toaster][data-sonner-theme='dark'] [data-sonner-toast][data-type='default'][data-styled='true'] [data-icon],
        html [data-sonner-toaster][data-sonner-theme='dark'] [data-sonner-toast][data-type='loading'][data-styled='true'] [data-icon] {
          background: hsl(var(--primary, 217.2 91.2% 59.8%) / 0.14);
          color: hsl(var(--primary, 217.2 91.2% 59.8%));
        }

        /* Loading Spinner Bar */
        html [data-sonner-toaster][data-sonner-theme='dark'] [data-sonner-toast][data-type='loading'][data-styled='true'] .sonner-loading-bar {
          background: hsl(var(--primary, 217.2 91.2% 59.8%));
        }

        /* Precision Typography */
        html [data-sonner-toaster][data-sonner-theme='dark'] [data-sonner-toast][data-styled='true'] [data-title] {
          font-family: var(--font-sans, system-ui, sans-serif);
          font-size: 0.875rem;
          font-weight: 600;
          letter-spacing: -0.01em;
          line-height: 1.45;
          color: hsl(var(--foreground, 210 40% 98%));
        }
        html [data-sonner-toaster][data-sonner-theme='dark'] [data-sonner-toast][data-styled='true'] [data-description] {
          font-family: var(--font-sans, system-ui, sans-serif);
          font-size: 0.8rem;
          line-height: 1.6;
          color: hsl(var(--muted-foreground, 215.4 16.3% 56.9%));
        }

        /* Circular Close Button */
        html [data-sonner-toaster][data-sonner-theme='dark'] [data-sonner-toast][data-styled='true'] [data-close-button] {
          background: hsl(var(--card, 222.2 84% 4.9%));
          border: 1px solid hsl(var(--border, 217.2 32.6% 17.5%) / 0.8);
          color: hsl(var(--muted-foreground, 215.4 16.3% 56.9%));
          border-radius: 9999px;
          transition: background-color 150ms cubic-bezier(0.16, 1, 0.3, 1),
                      border-color 150ms cubic-bezier(0.16, 1, 0.3, 1),
                      color 150ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        html [data-sonner-toaster][data-sonner-theme='dark'] [data-sonner-toast][data-styled='true'] [data-close-button]:hover {
          background: hsl(var(--muted, 217.2 32.6% 17.5%));
          border-color: hsl(var(--border, 217.2 32.6% 17.5%));
          color: hsl(var(--foreground, 210 40% 98%));
        }
      `}</style>
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
            toast:
              'group toast group-[.toaster]:bg-neutral-950/80 group-[.toaster]:backdrop-blur-xl group-[.toaster]:text-neutral-50 group-[.toaster]:border-neutral-800/60 group-[.toaster]:shadow-2xl group-[.toaster]:rounded-2xl group-[.toaster]:p-3.5 group-[.toaster]:gap-3 group-[.toaster]:font-sans group-[.toaster]:transition-all group-[.toaster]:duration-300',
            title:
              'group-[.toast]:font-semibold group-[.toast]:text-sm group-[.toast]:text-neutral-100 group-[.toast]:tracking-tight',
            description:
              'group-[.toast]:text-neutral-400 group-[.toast]:text-xs group-[.toast]:leading-relaxed',
            actionButton:
              'group-[.toast]:bg-neutral-100 group-[.toast]:text-neutral-950 group-[.toast]:font-semibold group-[.toast]:rounded-lg group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-xs group-[.toast]:transition-all group-[.toast]:duration-200 hover:group-[.toast]:bg-white active:group-[.toast]:scale-95 focus-visible:group-[.toast]:outline-none focus-visible:group-[.toast]:ring-2 focus-visible:group-[.toast]:ring-neutral-400/50',
            cancelButton:
              'group-[.toast]:bg-neutral-800 group-[.toast]:text-neutral-300 group-[.toast]:font-medium group-[.toast]:rounded-lg group-[.toast]:px-3 group-[.toast]:py-1.5 group-[.toast]:text-xs group-[.toast]:transition-all group-[.toast]:duration-200 hover:group-[.toast]:bg-neutral-700 active:group-[.toast]:scale-95 focus-visible:group-[.toast]:outline-none focus-visible:group-[.toast]:ring-2 focus-visible:group-[.toast]:ring-neutral-400/50',
            closeButton:
              'group-[.toast]:bg-neutral-900 group-[.toast]:border-neutral-700/80 group-[.toast]:text-neutral-400 hover:group-[.toast]:bg-neutral-800 hover:group-[.toast]:text-neutral-100 hover:group-[.toast]:border-neutral-600 group-[.toast]:rounded-full group-[.toast]:transition-colors group-[.toast]:duration-200 focus-visible:group-[.toast]:outline-none focus-visible:group-[.toast]:ring-2 focus-visible:group-[.toast]:ring-neutral-400/50',
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
    </>
  );
}
