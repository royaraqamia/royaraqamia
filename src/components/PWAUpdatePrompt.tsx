import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { RefreshCw, X } from 'lucide-react';
import { toast } from 'sonner';

export function PWAUpdatePrompt() {
  const [showUpdateBanner, setShowUpdateBanner] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    // Listen for custom event from service worker registration
    const handleSWUpdate = () => {
      setShowUpdateBanner(true);
      toast.info('تحديث جديد متاح!', {
        description: 'اضغط على الزر لتحديث التطبيق',
        position: 'top-center',
        duration: 5000,
      });
    };

    window.addEventListener('sw-update', handleSWUpdate);

    return () => {
      window.removeEventListener('sw-update', handleSWUpdate);
    };
  }, []);

  const handleUpdateClick = async () => {
    setIsUpdating(true);
    try {
      // Reload the page to activate the new service worker
      window.location.reload();
    } catch (error) {
      console.error('Error updating PWA:', error);
      toast.error('حدث خطأ أثناء التحديث', {
        position: 'top-center',
      });
      setIsUpdating(false);
    }
  };

  const handleDismiss = () => {
    setShowUpdateBanner(false);
    // Store dismissal in localStorage to not show again for a day
    localStorage.setItem('pwa-update-dismissed', Date.now().toString());
  };

  // Check if user dismissed recently
  useEffect(() => {
    const dismissed = localStorage.getItem('pwa-update-dismissed');
    if (dismissed) {
      const dismissTime = parseInt(dismissed);
      const oneDay = 24 * 60 * 60 * 1000;
      if (Date.now() - dismissTime < oneDay) {
        setShowUpdateBanner(false);
      }
    }
  }, []);

  if (!showUpdateBanner) {
    return null;
  }

  return (
    <div className="fixed top-20 right-4 left-4 md:left-auto md:w-96 z-50 animate-in slide-in-from-top-4 duration-300">
      <div className="bg-gradient-to-br from-green-600 to-emerald-600 text-white rounded-xl shadow-2xl p-4 border border-green-400/20">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
              <RefreshCw className={`w-6 h-6 ${isUpdating ? 'animate-spin' : ''}`} />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-lg mb-1">تحديث جديد متاح</h3>
            <p className="text-sm text-green-100 mb-3">
              إصدار جديد من تطبيق رؤية رقمية جاهز للتثبيت
            </p>
            <div className="flex gap-2">
              <Button
                onClick={handleUpdateClick}
                disabled={isUpdating}
                className="bg-white text-green-600 hover:bg-green-50 flex-1"
                size="sm"
              >
                {isUpdating ? 'جاري التحديث...' : 'تحديث الآن'}
              </Button>
              <Button
                onClick={handleDismiss}
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/20"
                disabled={isUpdating}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
