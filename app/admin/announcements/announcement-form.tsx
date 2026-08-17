'use client';

import { useState } from 'react';
import { broadcastAnnouncement } from '@/frontend/api/admin/announcements';
import { Button } from '@/frontend/ui/primitives/button';
import { Input } from '@/frontend/ui/primitives/input';
import { Textarea } from '@/frontend/ui/primitives/textarea';
import { Label } from '@/frontend/ui/primitives/label';
import { Card, CardContent } from '@/frontend/ui/primitives/card';
import { UserSelect } from '@/frontend/ui/admin/user-select';
import { Loader2, Send } from 'lucide-react';

export function AnnouncementForm() {
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [recipientUserIds, setRecipientUserIds] = useState<string[]>([]);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      setResult({ ok: false, message: 'العنوان مطلوب' });
      return;
    }
    setSending(true);
    setResult(null);
    const res = await broadcastAnnouncement(title.trim(), body.trim(), recipientUserIds);
    setSending(false);
    if (res.success) {
      setTitle('');
      setBody('');
      setRecipientUserIds([]);
      setResult({ ok: true, message: `تم إرسال الإعلان إلى ${res.sent ?? 0} مستخدم.` });
    } else {
      setResult({ ok: false, message: res.error ?? 'فشل إرسال الإعلان' });
    }
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          <div className="form-field">
            <Label htmlFor="title" className="form-label">
              العنوان{' '}
              <span className="text-destructive" aria-hidden="true">
                *
              </span>
            </Label>
            <Input
              id="title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={120}
              placeholder="مثال: تحديث جديد في المنصة"
              className="bg-muted border-border rounded-xl focus-ring"
            />
          </div>
          <div className="form-field">
            <Label htmlFor="body" className="form-label">
              نص الإعلان (اختياري)
            </Label>
            <Textarea
              id="body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              maxLength={1000}
              showCount
              placeholder="اكتب تفاصيل الإعلان..."
              className="bg-muted border-border rounded-xl focus-ring"
            />
          </div>
          <UserSelect
            id="recipient_user_ids"
            value={recipientUserIds}
            onChange={setRecipientUserIds}
            label="المستلمون (اختياري)"
            placeholder="اختر مستخدمين محددين للإعلان"
          />
          <p className="form-help-text -mt-2">اتركه فارغًا للإرسال لجميع المستخدمين.</p>

          {result && (
            <p
              className={`text-sm ${result.ok ? 'text-emerald-600' : 'text-destructive'}`}
              role="status"
            >
              {result.message}
            </p>
          )}

          <Button
            type="submit"
            className="btn-lift w-full transition-all duration-200 btn-press focus-ring touch-target"
            disabled={sending}
          >
            {sending ? (
              <Loader2 className="ms-2 size-4 animate-spin" />
            ) : (
              <Send className="ms-2 size-4" />
            )}
            {sending ? 'جارٍ الإرسال...' : 'إرسال الإعلان'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
