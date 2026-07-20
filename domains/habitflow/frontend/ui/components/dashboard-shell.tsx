'use client';

import { useEffect, useState, useTransition } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Plus,
  TrendingUp,
  Flame,
  CheckSquare,
  Heart,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { ErrorBoundary } from '@/components/shared/error-boundary';
import { Habit, HabitLog } from '@/domains/habitflow/models';
import { logout } from '@/lib/actions/auth';
import { useDashboard } from '@/domains/habitflow/frontend/state/use-dashboard';
import { useSession } from '@/domains/habitflow/frontend/state/session-provider';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatsCard } from '@/domains/habitflow/frontend/ui/components/stats-card';
import { HabitCard } from '@/domains/habitflow/frontend/ui/components/habit-card';
import { CalendarGrid } from '@/domains/habitflow/frontend/ui/components/calendar-grid';
import { AddHabitModal } from '@/domains/habitflow/frontend/ui/components/add-habit-modal';
import { EditHabitModal } from '@/domains/habitflow/frontend/ui/components/edit-habit-modal';
import { ConfirmDialog } from '@/components/shared/confirm-dialog';

interface DashboardShellProps {
  initialHabits: Habit[];
  initialLogs: HabitLog[];
  initialMode: 'supabase' | 'local';
  initialUser: unknown;
}

export function DashboardShell({
  initialHabits,
  initialLogs,
  initialMode,
  initialUser,
}: DashboardShellProps) {
  const { user: sessionUser } = useSession();

  const {
    habits,
    logs,
    activeDate,
    formError,
    isSubmitting,
    isAddModalOpen,
    isEditModalOpen,
    selectedHabit,
    habitName,
    habitIcon,
    habitFrequency,
    fileInputRef,
    activeStats,
    calendarGrid,
    setHabitName,
    setHabitIcon,
    setHabitFrequency,
    setIsAddModalOpen,
    setFormError,
    setActiveDate,
    handleAddHabit,
    handleEditHabit,
    handleArchiveHabit,
    confirmArchive,
    cancelArchive,
    confirmArchiveHabitId,
    handleToggleLog,
    handleDownloadBackup,
    handleImportBackupFile,
    showImportConfirm,
    confirmImport,
    cancelImport,
    showSyncConfirm,
    confirmSyncToCloud,
    cancelSyncToCloud,
    handleDateShift,
    getReadableActiveDate,
    openEditModal,
    closeEditModal,
    syncUser,
    todayDate,
    togglingHabitId,
  } = useDashboard({
    habits: initialHabits,
    logs: initialLogs,
    mode: initialMode,
    user: initialUser,
  });

  const shouldReduce = useReducedMotion();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [isLoggingOut, startLogoutTransition] = useTransition();
  useEffect(() => {
    if (sessionUser) {
      syncUser(sessionUser);
    }
  }, [sessionUser, syncUser]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        return;
      if ((e.key === 'n' || e.key === 'N') && !isAddModalOpen && !isEditModalOpen) {
        e.preventDefault();
        setIsAddModalOpen(true);
        setFormError('');
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAddModalOpen, isEditModalOpen, setIsAddModalOpen, setFormError]);

  return (
    <ErrorBoundary>
      <div className="min-h-[100dvh] pb-16 bg-background">
        <main id="main-content" className="max-w-6xl mx-auto px-6">
          <motion.div
            initial={shouldReduce ? false : { opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={
              shouldReduce
                ? undefined
                : {
                    type: 'spring',
                    stiffness: 300,
                    damping: 30,
                  }
            }
            className="space-y-8 will-change-transform"
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center bg-muted border border-border rounded-lg p-1 gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDateShift(-1)}
                  aria-label="اليوم السابق"
                  id="btn-prev-day"
                  className="h-9 w-9"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <span
                  className="text-xs font-semibold text-foreground px-2 whitespace-nowrap"
                  aria-live="polite"
                  aria-atomic="true"
                >
                  {getReadableActiveDate()}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDateShift(1)}
                  aria-label="اليوم التالي"
                  id="btn-next-day"
                  className="h-9 w-9"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              {activeDate !== todayDate && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveDate(todayDate)}
                  aria-label="العودة إلى اليوم"
                  className="text-xs"
                >
                  اليوم
                </Button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
              <StatsCard
                index={0}
                icon={TrendingUp}
                iconBg="bg-indigo-50 dark:bg-indigo-500/15"
                iconColor="text-indigo-600 dark:text-indigo-400"
                label="الاستمرارية (٣٠ يوم)"
                value={`${activeStats.averageCompletionRate}%`}
              />
              <StatsCard
                index={1}
                icon={Flame}
                iconBg="bg-orange-50 dark:bg-orange-500/15"
                iconColor="text-orange-600 dark:text-orange-400"
                label="أطول سلسلة نشطة"
                value={`${activeStats.highestStreak} أيام`}
              />
              <StatsCard
                index={2}
                icon={CheckSquare}
                iconBg="bg-emerald-50 dark:bg-emerald-500/15"
                iconColor="text-emerald-600 dark:text-emerald-400"
                label="المكتمل اليوم"
                value={`${activeStats.totalHabitsCompletedToday} / ${habits.length}`}
              />
              <StatsCard
                index={3}
                icon={Heart}
                iconBg="bg-rose-50 dark:bg-rose-500/15"
                iconColor="text-rose-600 dark:text-rose-400"
                label="معدل الإكمال اليومي"
                value={`${activeStats.completedPercentageToday}%`}
              />
            </div>

            <motion.div
              initial={shouldReduce ? false : { opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, amount: 0.15 }}
              transition={shouldReduce ? undefined : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
              className="grid grid-cols-1 lg:grid-cols-3 gap-8"
            >
              <div className="lg:col-span-2 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-[clamp(1rem,2vw,1.125rem)] font-bold text-foreground leading-snug">
                      قائمة عادات اليوم
                    </h2>
                    <p className="text-xs text-muted-foreground leading-relaxed">
                      اضغط على الدوائر لتبديل حالة التسجيل ليوم {activeDate}
                    </p>
                  </div>
                  <Button
                    onClick={() => {
                      setIsAddModalOpen(true);
                      setFormError('');
                    }}
                    id="btn-create-habit"
                  >
                    <Plus className="w-4 h-4 ms-1.5" />
                    إضافة عادة
                  </Button>
                </div>

                {habits.length === 0 ? (
                  <Card className="border-dashed p-12 text-center space-y-4">
                    <div className="w-16 h-16 rounded-2xl bg-primary/5 flex items-center justify-center mx-auto">
                      <CheckSquare className="w-8 h-8 text-primary/60" />
                    </div>
                    <div className="space-y-1">
                      <p className="text-base font-bold text-foreground">ابدأ رحلة عاداتك</p>
                      <p className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed">
                        أنشئ أول عادة يومية أو أسبوعية. التغييرات الصغيرة تصنع نتائج كبيرة.
                      </p>
                    </div>
                    <Button
                      onClick={() => {
                        setIsAddModalOpen(true);
                        setFormError('');
                      }}
                      className="mt-2"
                    >
                      <Plus className="w-4 h-4 ms-1.5" />
                      إنشاء عادة روتينية
                    </Button>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {habits.map((habit) => (
                      <HabitCard
                        key={habit.id}
                        habit={habit}
                        logs={logs}
                        activeDate={activeDate}
                        onToggle={handleToggleLog}
                        onEdit={openEditModal}
                        togglingHabitId={togglingHabitId}
                      />
                    ))}
                  </div>
                )}
              </div>

              <CalendarGrid
                calendarGrid={calendarGrid}
                logs={logs}
                habitsCount={habits.length}
                onDateSelect={setActiveDate}
                activeDate={activeDate}
              />
            </motion.div>
          </motion.div>

          <motion.div
            initial={shouldReduce ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={shouldReduce ? undefined : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="border-t border-border pt-6 mt-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
          >
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                النسخ الاحتياطي
              </h3>
              <p className="text-xs text-muted-foreground mt-0.5">
                تصدير أو استعادة جميع بيانات عاداتك
              </p>
            </div>
            <div className="flex items-center gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                className="hidden"
                aria-label="استيراد نسخة احتياطية"
                onChange={(e) => {
                  if (e.target.files?.[0]) handleImportBackupFile(e.target.files[0]);
                  e.target.value = '';
                }}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                aria-controls="backup-file-input"
              >
                استيراد
              </Button>
              <Button variant="outline" size="sm" onClick={handleDownloadBackup}>
                تصدير
              </Button>
            </div>
          </motion.div>
        </main>

        <AddHabitModal
          isOpen={isAddModalOpen}
          habitName={habitName}
          habitIcon={habitIcon}
          habitFrequency={habitFrequency}
          formError={formError}
          isSubmitting={isSubmitting}
          onClose={() => {
            setIsAddModalOpen(false);
            setFormError('');
          }}
          onNameChange={setHabitName}
          onIconChange={setHabitIcon}
          onFrequencyChange={setHabitFrequency}
          onSubmit={handleAddHabit}
        />

        <EditHabitModal
          isOpen={isEditModalOpen}
          habit={selectedHabit}
          habitName={habitName}
          habitIcon={habitIcon}
          habitFrequency={habitFrequency}
          formError={formError}
          isSubmitting={isSubmitting}
          onClose={closeEditModal}
          onNameChange={setHabitName}
          onIconChange={setHabitIcon}
          onFrequencyChange={setHabitFrequency}
          onSubmit={handleEditHabit}
          onArchive={handleArchiveHabit}
        />

        <ConfirmDialog
          open={!!confirmArchiveHabitId}
          title="أرشفة العادة"
          message="هل أنت متأكد من رغبتك في أرشفة هذه العادة؟ سيتم الاحتفاظ بسجلّاتك السابقة."
          confirmLabel="أرشفة"
          cancelLabel="إلغاء"
          onConfirm={confirmArchive}
          onCancel={cancelArchive}
        />

        <ConfirmDialog
          open={showLogoutConfirm}
          title="تسجيل الخروج"
          message="هل أنت متأكد من رغبتك في تسجيل الخروج؟"
          confirmLabel={isLoggingOut ? 'جارٍ تسجيل الخروج...' : 'تسجيل الخروج'}
          cancelLabel="إلغاء"
          onConfirm={() => startLogoutTransition(() => logout())}
          onCancel={() => setShowLogoutConfirm(false)}
        />

        <ConfirmDialog
          open={showImportConfirm}
          title="استعادة النسخة الاحتياطية"
          message="استعادة نسخة احتياطية ستحلّ محل جميع العادات والسجلات الحالية. هذا الإجراء لا يمكن التراجع عنه. هل أنت متأكد؟"
          confirmLabel="استعادة"
          cancelLabel="إلغاء"
          onConfirm={confirmImport}
          onCancel={cancelImport}
        />

        <ConfirmDialog
          open={showSyncConfirm}
          title="مزامنة البيانات المحلية"
          message="سيتم إرسال بياناتك المحلية إلى السحابة وحلّها محل البيانات السحابية الحالية. هل أنت متأكد؟"
          confirmLabel="مزامنة"
          cancelLabel="إلغاء"
          onConfirm={confirmSyncToCloud}
          onCancel={cancelSyncToCloud}
        />
      </div>
    </ErrorBoundary>
  );
}
