import { MySubmissionsView } from '@/frontend/ui/account/my-submissions-view';

export default function AccountSubmissionsPage() {
  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-extrabold tracking-tight sm:text-3xl">طلباتي</h1>
        <p className="text-sm text-muted-foreground leading-relaxed">
          الطَّلبات التي أرسلتها وأنت مسجَّل الدُّخول. يمكنك تعديل بياناتها في أيِّ وقت، وسيُبلَّغ
          الفريق بكلِّ تعديل.
        </p>
      </header>

      <MySubmissionsView />
    </div>
  );
}
