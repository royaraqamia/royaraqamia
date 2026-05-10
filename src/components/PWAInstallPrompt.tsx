import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Download, X } from 'lucide-react';
import { toast } from 'sonner';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showInstallBanner, setShowInstallBanner] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);

  useEffect(() => {
    // Check if already installed
    const checkInstalled = () => {
      const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
      // @ts-expect-error - iOS Safari specific property
      const isInWebAppiOS = window.navigator.standalone === true;
      setIsInstalled(isStandalone || isInWebAppiOS);
    };

    checkInstalled();

    // Listen for beforeinstallprompt event
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);

      // Show banner after a delay (user-friendly)
      setTimeout(() => {
        setShowInstallBanner(true);
      }, 3000);
    };

    // Listen for app installed event
    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setShowInstallBanner(false);
      setIsInstalled(true);
      toast.success('تمَّ تثبيت التَّطبيق بنجاح!', {
        position: 'top-center',
      });
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;

    try {
      await deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;

      if (outcome === 'accepted') {
        toast.success('شكرًا لتثبيت تطبيق رؤية رقمية!', {
          position: 'top-center',
        });
      } else {
        toast.info('يمكنك تثبيت التَّطبيق لاحقًا من المتصفِّح', {
          position: 'top-center',
        });
      }

      setDeferredPrompt(null);
      setShowInstallBanner(false);
    } catch (error) {
      console.error('Error during PWA installation:', error);
      toast.error('حدث خطأ أثناء تثبيت التَّطبيق', {
        position: 'top-center',
      });
    }
  };

  const handleDismiss = () => {
    setShowInstallBanner(false);
    // Store dismissal in localStorage to not show again for a week
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  // Check if user dismissed recently
  useEffect(() => {
    const dismissed = localStorage.getItem('pwa-install-dismissed');
    if (dismissed) {
      const dismissTime = parseInt(dismissed);
      const oneWeek = 7 * 24 * 60 * 60 * 1000;
      if (Date.now() - dismissTime < oneWeek) {
        setShowInstallBanner(false);
      }
    }
  }, []);

  // Don't show if already installed, no prompt available, or dismissed
  if (isInstalled || !deferredPrompt || !showInstallBanner) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-gradient-to-br from-purple-600 to-indigo-600 text-white rounded-xl shadow-2xl p-4 border border-purple-400/20 relative">
        <button
          onClick={handleDismiss}
          className="absolute top-4 left-4 text-white hover:bg-white/20 p-1 rounded-md transition-colors"
          aria-label="إغلاق"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
              <Download className="w-6 h-6" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-lg mb-1">تثبيت تطبيق رؤية رقمية</h3>
            <Button
              onClick={handleInstallClick}
              className="bg-white text-purple-600 hover:bg-purple-50 w-full"
              size="sm"
            >
              تثبيت الآن
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
