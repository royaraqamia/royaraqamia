import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Bell, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  requestNotificationPermission,
  subscribeToPushNotifications,
  isPushNotificationsConfigured,
  isUserSubscribed,
} from '@/utils/push-notifications';

export function PushNotificationPrompt() {
  const [showPrompt, setShowPrompt] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    // Check if push notifications are configured
    if (!isPushNotificationsConfigured()) {
      return;
    }

    // Check current permission
    setPermission(Notification.permission);

    // Check if already subscribed
    const checkSubscription = async () => {
      if ('serviceWorker' in navigator) {
        const registration = await navigator.serviceWorker.ready;
        const subscribed = await isUserSubscribed(registration);
        setIsSubscribed(subscribed);
      }
    };

    checkSubscription();

    // Show prompt after a delay if permission is default
    if (Notification.permission === 'default') {
      const timer = setTimeout(() => {
        const dismissed = localStorage.getItem('push-notification-dismissed');
        const dismissTime = dismissed ? parseInt(dismissed) : 0;
        const oneWeek = 7 * 24 * 60 * 60 * 1000;

        if (Date.now() - dismissTime > oneWeek) {
          setShowPrompt(true);
        }
      }, 5000); // Show after 5 seconds

      return () => clearTimeout(timer);
    }
  }, []);

  const handleEnableNotifications = async () => {
    setIsLoading(true);
    try {
      const newPermission = await requestNotificationPermission();

      if (newPermission === 'granted') {
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.ready;
          const subscription = await subscribeToPushNotifications(registration);

          if (subscription) {
            setIsSubscribed(true);
            setShowPrompt(false);
            toast.success('تم تفعيل الإشعارات بنجاح!', {
              description: 'ستصلك إشعارات عند وجود تحديثات أو أخبار جديدة',
              position: 'top-center',
            });
          }
        }
      } else if (newPermission === 'denied') {
        setShowPrompt(false);
        toast.info('تم رفض الإشعارات', {
          description: 'يمكنك تفعيلها لاحقاً من إعدادات المتصفح',
          position: 'top-center',
        });
      }
    } catch (error) {
      console.error('Error enabling notifications:', error);
      toast.error('حدث خطأ أثناء تفعيل الإشعارات', {
        position: 'top-center',
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleDismiss = () => {
    setShowPrompt(false);
    localStorage.setItem('push-notification-dismissed', Date.now().toString());
  };

  // Don't show if not configured or permission already granted/denied
  if (!isPushNotificationsConfigured()) {
    return null;
  }


  // Show enable button if not subscribed and permission is granted
  if (permission === 'granted' && !isSubscribed && !showPrompt) {
    return (
      <div className="fixed bottom-20 right-4 z-40">
        <Button
          onClick={handleEnableNotifications}
          variant="outline"
          size="sm"
          className="bg-white/90 backdrop-blur-sm border-purple-200 hover:bg-purple-50"
          disabled={isLoading}
        >
          <Bell className="w-4 h-4 mr-2" />
          تفعيل الإشعارات
        </Button>
      </div>
    );
  }

  // Show prompt banner
  if (!showPrompt) {
    return null;
  }

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 animate-in slide-in-from-bottom-4 duration-300">
      <div className="bg-gradient-to-br from-blue-600 to-indigo-600 text-white rounded-xl shadow-2xl p-4 border border-blue-400/20">
        <div className="flex items-start gap-3">
          <div className="flex-shrink-0">
            <div className="w-12 h-12 bg-white/20 rounded-lg flex items-center justify-center backdrop-blur-sm">
              <Bell className="w-6 h-6" />
            </div>
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-lg mb-1">تفعيل الإشعارات</h3>
            <p className="text-sm text-blue-100 mb-3">
              احصل على إشعارات فورية حول التحديثات الجديدة والأخبار المهمة
            </p>
            <div className="flex gap-2">
              <Button
                onClick={handleEnableNotifications}
                disabled={isLoading}
                className="bg-white text-blue-600 hover:bg-blue-50 flex-1"
                size="sm"
              >
                {isLoading ? 'جاري التفعيل...' : 'تفعيل الآن'}
              </Button>
              <Button
                onClick={handleDismiss}
                variant="ghost"
                size="sm"
                className="text-white hover:bg-white/20"
                disabled={isLoading}
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
