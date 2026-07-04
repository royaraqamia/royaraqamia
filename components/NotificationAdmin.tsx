import { useState, useEffect } from 'react';
import { createClient } from '@supabase/supabase-js';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from './ui/card';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { toast } from 'sonner';
import { Users, Send, History, BarChart3, Trash2, RefreshCw } from 'lucide-react';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

interface Subscription {
  id: string;
  endpoint: string;
  user_agent: string | null;
  user_id: string | null;
  created_at: string;
  is_active: boolean;
}

interface NotificationHistory {
  id: string;
  title: string;
  body: string;
  target_type: string;
  sent_count: number;
  failed_count: number;
  created_at: string;
  sent_at: string | null;
}

type TabType = 'subscriptions' | 'send' | 'history' | 'analytics';

export function NotificationAdmin() {
  const [activeTab, setActiveTab] = useState<TabType>('subscriptions');
  const [subscriptions, setSubscriptions] = useState<Subscription[]>([]);
  const [notificationHistory, setNotificationHistory] = useState<NotificationHistory[]>([]);
  const [loading, setLoading] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Send notification form state
  const [notificationForm, setNotificationForm] = useState({
    title: '',
    body: '',
    icon: '/icons/icon-192x192.png',
    url: '/',
    targetType: 'all',
    targetUserId: '',
  });

  useEffect(() => {
    checkAdminAccess();
  }, []);

  useEffect(() => {
    if (isAdmin && activeTab === 'subscriptions') {
      fetchSubscriptions();
    }
    if (isAdmin && activeTab === 'history') {
      fetchNotificationHistory();
    }
  }, [isAdmin, activeTab]);

  const checkAdminAccess = async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        // Check if user has admin role in user metadata
        const userMetadata = user.user_metadata;
        if (userMetadata.role === 'admin') {
          setIsAdmin(true);
        } else {
          toast.error('تم رفض الوصول: مطلوب صلاحية المشرف');
        }
      } else {
        toast.error('يرجى تسجيل الدخول للوصول إلى لوحة التحكم');
      }
    } catch (error) {
      console.error('Error checking admin access:', error);
      toast.error('فشل التحقق من صلاحية المشرف');
    } finally {
      setCheckingAuth(false);
    }
  };

  const fetchSubscriptions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('push_subscriptions')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setSubscriptions(data || []);
    } catch (error) {
      console.error('Error fetching subscriptions:', error);
      toast.error('فشل جلب الاشتراكات');
    } finally {
      setLoading(false);
    }
  };

  const fetchNotificationHistory = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('notification_history')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      setNotificationHistory(data || []);
    } catch (error) {
      console.error('Error fetching notification history:', error);
      toast.error('فشل جلب سجل الإشعارات');
    } finally {
      setLoading(false);
    }
  };

  const toggleSubscription = async (id: string, currentStatus: boolean) => {
    try {
      const { error } = await supabase
        .from('push_subscriptions')
        .update({ is_active: !currentStatus })
        .eq('id', id);

      if (error) throw error;
      toast.success('تم تحديث الاشتراك');
      fetchSubscriptions();
    } catch (error) {
      console.error('Error updating subscription:', error);
      toast.error('فشل تحديث الاشتراك');
    }
  };

  const deleteSubscription = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الاشتراك؟')) return;

    try {
      const { error } = await supabase
        .from('push_subscriptions')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success('تم حذف الاشتراك');
      fetchSubscriptions();
    } catch (error) {
      console.error('Error deleting subscription:', error);
      toast.error('فشل حذف الاشتراك');
    }
  };

  const sendNotification = async () => {
    if (!notificationForm.title || !notificationForm.body) {
      toast.error('العنوان والمحتوى مطلوبان');
      return;
    }

    setLoading(true);
    try {
      // Call the Supabase edge function
      const { data, error } = await supabase.functions.invoke('send-push-notification', {
        body: {
          title: notificationForm.title,
          body: notificationForm.body,
          icon: notificationForm.icon,
          url: notificationForm.url,
        },
      });

      if (error) throw error;

      toast.success(`تم إرسال الإشعار إلى ${data.sent} مشترك`);

      // Log to notification history
      await supabase.from('notification_history').insert({
        title: notificationForm.title,
        body: notificationForm.body,
        icon: notificationForm.icon,
        url: notificationForm.url,
        target_type: notificationForm.targetType,
        target_user_id: notificationForm.targetUserId || null,
        sent_count: data.sent || 0,
        failed_count: data.failed || 0,
        sent_at: new Date().toISOString(),
      });

      // Reset form
      setNotificationForm({
        title: '',
        body: '',
        icon: '/icons/icon-192x192.png',
        url: '/',
        targetType: 'all',
        targetUserId: '',
      });

      // Refresh history
      fetchNotificationHistory();
    } catch (error) {
      console.error('Error sending notification:', error);
      toast.error('فشل إرسال الإشعار');
    } finally {
      setLoading(false);
    }
  };

  if (checkingAuth) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <RefreshCw className="h-8 w-8 animate-spin text-purple-500" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <Card className="max-w-2xl mx-auto mt-8">
        <CardHeader>
          <CardTitle>تم رفض الوصول</CardTitle>
          <CardDescription>تحتاج إلى صلاحيات المشرف للوصول إلى هذه اللوحة</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">
            يرجى تسجيل الدخول بحساب لديه صلاحية المشرف في بيانات المستخدم.
          </p>
        </CardContent>
      </Card>
    );
  }

  const activeSubscriptions = subscriptions.filter(s => s.is_active).length;
  const totalSent = notificationHistory.reduce((sum, n) => sum + n.sent_count, 0);
  const totalFailed = notificationHistory.reduce((sum, n) => sum + n.failed_count, 0);

  return (
    <div className="container mx-auto pt-24 pb-8 px-4">
      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <Button
          variant={activeTab === 'subscriptions' ? 'default' : 'outline'}
          onClick={() => setActiveTab('subscriptions')}
        >
          <Users className="h-4 w-4 mr-2" />
          الاشتراكات ({activeSubscriptions})
        </Button>
        <Button
          variant={activeTab === 'send' ? 'default' : 'outline'}
          onClick={() => setActiveTab('send')}
        >
          <Send className="h-4 w-4 mr-2" />
          إرسال إشعار
        </Button>
        <Button
          variant={activeTab === 'history' ? 'default' : 'outline'}
          onClick={() => setActiveTab('history')}
        >
          <History className="h-4 w-4 mr-2" />
          السجل
        </Button>
        <Button
          variant={activeTab === 'analytics' ? 'default' : 'outline'}
          onClick={() => setActiveTab('analytics')}
        >
          <BarChart3 className="h-4 w-4 mr-2" />
          الإحصائيات
        </Button>
      </div>

      {/* Subscriptions Tab */}
      {activeTab === 'subscriptions' && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>اشتراكات الإشعارات</CardTitle>
                <CardDescription>
                  الإجمالي: {subscriptions.length} | نشط: {activeSubscriptions}
                </CardDescription>
              </div>
              <Button variant="outline" onClick={fetchSubscriptions} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                تحديث
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading && subscriptions.length === 0 ? (
              <div className="text-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-purple-500" />
              </div>
            ) : subscriptions.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                لم يتم العثور على اشتراكات
              </div>
            ) : (
              <div className="space-y-2">
                {subscriptions.map((sub) => (
                  <div
                    key={sub.id}
                    className="flex items-center justify-between p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={sub.is_active ? 'default' : 'secondary'}>
                          {sub.is_active ? 'نشط' : 'غير نشط'}
                        </Badge>
                        {sub.user_id && (
                          <Badge variant="outline">مستخدم: {sub.user_id.slice(0, 8)}...</Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground truncate font-mono">
                        {sub.endpoint}
                      </p>
                      {sub.user_agent && (
                        <p className="text-xs text-muted-foreground mt-1">
                          {sub.user_agent}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground mt-1">
                        تاريخ الإضافة: {new Date(sub.created_at).toLocaleString('ar-EG')}
                      </p>
                    </div>
                    <div className="flex gap-2 ml-4">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => toggleSubscription(sub.id, sub.is_active)}
                      >
                        {sub.is_active ? 'إيقاف' : 'تفعيل'}
                      </Button>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteSubscription(sub.id)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Send Notification Tab */}
      {activeTab === 'send' && (
        <Card>
          <CardHeader>
            <CardTitle>إرسال إشعار</CardTitle>
            <CardDescription>إنشاء وإرسال إشعار للمشتركين</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">العنوان *</label>
              <input
                type="text"
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                value={notificationForm.title}
                onChange={(e) => setNotificationForm({ ...notificationForm, title: e.target.value })}
                placeholder="عنوان الإشعار"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">المحتوى *</label>
              <textarea
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[100px]"
                value={notificationForm.body}
                onChange={(e) => setNotificationForm({ ...notificationForm, body: e.target.value })}
                placeholder="محتوى الإشعار"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">رابط الأيقونة</label>
              <input
                type="text"
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                value={notificationForm.icon}
                onChange={(e) => setNotificationForm({ ...notificationForm, icon: e.target.value })}
                placeholder="/icons/icon-192x192.png"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">الرابط المستهدف</label>
              <input
                type="text"
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                value={notificationForm.url}
                onChange={(e) => setNotificationForm({ ...notificationForm, url: e.target.value })}
                placeholder="/"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-2">نوع الاستهداف</label>
              <select
                className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                value={notificationForm.targetType}
                onChange={(e) => setNotificationForm({ ...notificationForm, targetType: e.target.value })}
              >
                <option value="all">جميع المشتركين</option>
                <option value="user">مستخدم محدد</option>
              </select>
            </div>
            {notificationForm.targetType === 'user' && (
              <div>
                <label className="block text-sm font-medium mb-2">معرف المستخدم</label>
                <input
                  type="text"
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500"
                  value={notificationForm.targetUserId}
                  onChange={(e) => setNotificationForm({ ...notificationForm, targetUserId: e.target.value })}
                  placeholder="أدخل UUID المستخدم"
                />
              </div>
            )}
          </CardContent>
          <CardFooter>
            <Button onClick={sendNotification} disabled={loading} className="w-full">
              {loading ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  جاري الإرسال...
                </>
              ) : (
                <>
                  <Send className="h-4 w-4 mr-2" />
                  إرسال الإشعار
                </>
              )}
            </Button>
          </CardFooter>
        </Card>
      )}

      {/* History Tab */}
      {activeTab === 'history' && (
        <Card>
          <CardHeader>
            <div className="flex justify-between items-center">
              <div>
                <CardTitle>سجل الإشعارات</CardTitle>
                <CardDescription>عرض الإشعارات المرسلة وحالة التسليم</CardDescription>
              </div>
              <Button variant="outline" onClick={fetchNotificationHistory} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                تحديث
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {loading && notificationHistory.length === 0 ? (
              <div className="text-center py-8">
                <RefreshCw className="h-8 w-8 animate-spin mx-auto text-purple-500" />
              </div>
            ) : notificationHistory.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                لم يتم العثور على سجل إشعارات
              </div>
            ) : (
              <div className="space-y-2">
                {notificationHistory.map((notification) => (
                  <div
                    key={notification.id}
                    className="p-4 border rounded-lg hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <h4 className="font-semibold">{notification.title}</h4>
                        <p className="text-sm text-muted-foreground">{notification.body}</p>
                      </div>
                      <Badge variant="outline">{notification.target_type}</Badge>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>تم الإرسال: {notification.sent_count}</span>
                      <span>فشل: {notification.failed_count}</span>
                      <span>{new Date(notification.created_at).toLocaleString('ar-EG')}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Analytics Tab */}
      {activeTab === 'analytics' && (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle>إجمالي الاشتراكات</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{subscriptions.length}</div>
              <p className="text-sm text-muted-foreground mt-2">
                {activeSubscriptions} نشط
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>إجمالي المرسل</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">{totalSent}</div>
              <p className="text-sm text-muted-foreground mt-2">
                إشعار تم تسليمه
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>إجمالي الفاشل</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold text-destructive">{totalFailed}</div>
              <p className="text-sm text-muted-foreground mt-2">
                تسليم فاشل
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>معدل النجاح</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-bold">
                {totalSent + totalFailed > 0
                  ? ((totalSent / (totalSent + totalFailed)) * 100).toFixed(1)
                  : '0'}%
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                معدل نجاح التسليم
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
