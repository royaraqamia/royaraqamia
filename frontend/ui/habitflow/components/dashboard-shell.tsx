'use client';

import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import {
  Plus,
  TrendingUp,
  Flame,
  CheckSquare,
  Heart,
  ChevronLeft,
  ChevronRight,
  Download,
  Upload,
  Sparkles,
  Calendar as CalendarIcon,
  Database,
} from 'lucide-react';
import { ErrorBoundary } from '@/frontend/ui/shared/error-boundary';
import { Habit, HabitLog } from '@/shared/contracts/habitflow';
import { useDashboard } from '@/frontend/state/habitflow/use-dashboard';
import { useLogout } from '@/frontend/state/use-logout';
import { useSession } from '@/frontend/state/session-provider';
import { Button } from '@/frontend/ui/primitives/button';
import { EmptyState } from '@/frontend/ui/primitives/empty-state';
import { StatsCard } from '@/frontend/ui/habitflow/components/stats-card';
import { HabitCard } from '@/frontend/ui/habitflow/components/habit-card';
import { CalendarGrid } from '@/frontend/ui/habitflow/components/calendar-grid';
import { AddHabitModal } from '@/frontend/ui/habitflow/components/add-habit-modal';
import { EditHabitModal } from '@/frontend/ui/habitflow/components/edit-habit-modal';
import { NotesDialog } from '@/frontend/ui/habitflow/components/notes-dialog';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';

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
    handleSkipHabit,
    handleSaveNote,
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
    skippingHabitId,
  } = useDashboard({
    habits: initialHabits,
    logs: initialLogs,
    mode: initialMode,
    user: initialUser,
  });

  const shouldReduce = useReducedMotion();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [noteHabitId, setNoteHabitId] = useState<string | null>(null);
  const { signOut, isLoggingOut } = useLogout();

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
      <main
        className="min-h-screen bg-slate-50/50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 selection:bg-primary/20 selection:text-primary transition-colors duration-300"
        dir="rtl"
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-10 space-y-8 lg:space-y-10">
          {/* Header & Date Navigation Toolbar */}
          <motion.header
            initial={shouldReduce ? false : { opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={shouldReduce ? undefined : { type: 'spring', stiffness: 300, damping: 30 }}
            className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 pb-6 border-b border-slate-200/80 dark:border-slate-800/80"
          >
            <div className="space-y-1.5">
              <div className="flex items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-primary/10 text-primary border border-primary/20">
                  <Sparkles className="w-3.5 h-3.5" />
                  لوحة التَّحكُّم
                </span>
                {initialMode === 'local' ? (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20">
                    وضع محلِّي
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                    مزامنة سحابيَّة
                  </span>
                )}
              </div>
              <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight bg-linear-to-r from-slate-900 via-slate-800 to-slate-700 dark:from-white dark:via-slate-200 dark:to-slate-400 bg-clip-text text-transparent">
                إدارة العادات
              </h1>
            </div>

            <div className="flex items-center gap-3 self-start sm:self-auto flex-wrap">
              <div className="flex items-center bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200/80 dark:border-slate-800/80 rounded-2xl p-1 shadow-xs transition-all hover:border-slate-300 dark:hover:border-slate-700">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDateShift(-1)}
                  aria-label="اليوم السَّابق"
                  id="btn-prev-day"
                  className="size-9 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-transform active:scale-95 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
                <div className="flex items-center gap-1.5 px-3 py-1">
                  <CalendarIcon className="w-3.5 h-3.5 text-slate-400" />
                  <span
                    className="text-xs sm:text-sm font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap min-w-25 text-center select-none"
                    aria-live="polite"
                    aria-atomic="true"
                  >
                    {getReadableActiveDate()}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDateShift(1)}
                  aria-label="اليوم التَّالي"
                  id="btn-next-day"
                  className="size-9 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-transform active:scale-95 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              </div>

              <motion.div
                initial={false}
                animate={{
                  opacity: activeDate !== todayDate ? 1 : 0,
                  scale: activeDate !== todayDate ? 1 : 0.8,
                }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className={activeDate !== todayDate ? '' : 'pointer-events-none'}
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setActiveDate(todayDate)}
                  aria-label="العودة إلى اليوم"
                  className="text-xs font-semibold rounded-xl border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 shadow-2xs transition-all active:scale-95 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  اليوم
                </Button>
              </motion.div>
            </div>
          </motion.header>

          {/* Stats Section */}
          <section aria-label="إحصائيَّات العادات">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6">
              <StatsCard
                index={0}
                icon={TrendingUp}
                label="الاستمراريَّة ( يوم)"
                value={`${activeStats.averageCompletionRate}%`}
              />
              <StatsCard
                index={1}
                icon={Flame}
                label="أطول سلسلة نشطة"
                value={`${activeStats.highestStreak} أيام`}
              />
              <StatsCard
                index={2}
                icon={CheckSquare}
                label="المكتمل اليوم"
                value={`${activeStats.totalHabitsCompletedToday} / ${habits.length}`}
              />
              <StatsCard
                index={3}
                icon={Heart}
                label="مُعدَّل الإكمال اليومي"
                value={`${activeStats.completedPercentageToday}%`}
              />
            </div>
          </section>

          {/* Main Workspace Layout */}
          <motion.div
            initial={shouldReduce ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.15 }}
            transition={shouldReduce ? undefined : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start"
          >
            {/* Habits List Column */}
            <section className="lg:col-span-7 xl:col-span-8 space-y-5" aria-label="قائمة العادات">
              <div className="flex items-center justify-between gap-4 pb-1">
                <div className="flex items-center gap-3">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
                    قائمة عادات اليوم
                  </h2>
                  {habits.length > 0 && (
                    <span className="inline-flex items-center justify-center px-2.5 py-0.5 text-xs font-bold rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                      {habits.length}
                    </span>
                  )}
                </div>

                <Button
                  onClick={() => {
                    setIsAddModalOpen(true);
                    setFormError('');
                  }}
                  id="btn-create-habit"
                  className="rounded-xl shadow-xs hover:shadow-md transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] bg-primary text-primary-foreground font-semibold px-4 py-2 text-sm flex items-center gap-1.5 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <Plus className="w-4 h-4" />
                  <span>إضافة عادة</span>
                  <kbd className="hidden sm:inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-white/20 dark:bg-black/20 border border-white/20 dark:border-black/20 me-1">
                    N
                  </kbd>
                </Button>
              </div>

              {habits.length === 0 ? (
                <div className="rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white/60 dark:bg-slate-900/60 backdrop-blur-md p-8 sm:p-12 text-center shadow-xs">
                  <EmptyState
                    icon={CheckSquare}
                    variant="card"
                    title="ابدأ رحلة عاداتك"
                    description="أنشِئ أوَّل عادة يوميَّة أو أسبوعيَّة. التَّغييرات الصَّغيرة تصنع نتائج كبيرة."
                    action={
                      <Button
                        onClick={() => {
                          setIsAddModalOpen(true);
                          setFormError('');
                        }}
                        className="mt-4 rounded-xl shadow-xs transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] cursor-pointer"
                      >
                        <Plus className="w-4 h-4 ms-1.5" />
                        إنشاء عادة روتينيَّة
                      </Button>
                    }
                  />
                </div>
              ) : (
                <div className="space-y-3.5">
                  {habits.map((habit) => (
                    <HabitCard
                      key={habit.id}
                      habit={habit}
                      logs={logs}
                      activeDate={activeDate}
                      onToggle={handleToggleLog}
                      onSkip={handleSkipHabit}
                      onNote={setNoteHabitId}
                      onEdit={openEditModal}
                      togglingHabitId={togglingHabitId}
                      skippingHabitId={skippingHabitId}
                    />
                  ))}
                </div>
              )}
            </section>

            {/* Calendar Grid Column */}
            <section className="lg:col-span-5 xl:col-span-4" aria-label="التَّقويم والسِّجل">
              <div className="sticky top-6 rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md p-5 sm:p-6 shadow-xs transition-all hover:border-slate-300 dark:hover:border-slate-700">
                <CalendarGrid
                  calendarGrid={calendarGrid}
                  logs={logs}
                  habitsCount={habits.length}
                  onDateSelect={setActiveDate}
                  activeDate={activeDate}
                />
              </div>
            </section>
          </motion.div>

          {/* Backup & Data Management Footer Banner */}
          <motion.footer
            initial={shouldReduce ? false : { opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.3 }}
            transition={shouldReduce ? undefined : { duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="rounded-3xl border border-slate-200/80 dark:border-slate-800/80 bg-linear-to-r from-slate-50/80 via-white to-slate-100/50 dark:from-slate-900/80 dark:via-slate-900/50 dark:to-slate-950/80 backdrop-blur-md p-5 sm:p-6 shadow-xs transition-all hover:border-slate-300 dark:hover:border-slate-700"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="p-2.5 rounded-2xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 text-slate-700 dark:text-slate-300">
                  <Database className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-xs font-bold text-slate-900 dark:text-slate-100 tracking-wider uppercase">
                    النَّسخ الاحتياطي وإدارة البيانات
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    تصدير أو استعادة جميع بيانات عاداتك وسجلاتك السَّابقة بأمان
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 self-end sm:self-auto">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  className="hidden"
                  aria-label="استيراد نسخة احتياطيَّة"
                  onChange={(e) => {
                    if (e.target.files?.[0]) handleImportBackupFile(e.target.files[0]);
                    e.target.value = '';
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fileInputRef.current?.click()}
                  aria-controls="file-input-ref"
                  className="rounded-xl border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium px-3.5 py-2 text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>استيراد</span>
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadBackup}
                  className="rounded-xl border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-medium px-3.5 py-2 text-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>تصدير</span>
                </Button>
              </div>
            </div>
          </motion.footer>

          {/* Dialogs & Modals */}
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

          <NotesDialog
            isOpen={!!noteHabitId}
            habitName={habits.find((h) => h.id === noteHabitId)?.name ?? 'العادة'}
            dateLabel={getReadableActiveDate()}
            initialNote={
              noteHabitId
                ? (logs.find((l) => l.habitId === noteHabitId && l.date === activeDate)?.note ?? '')
                : ''
            }
            onClose={() => setNoteHabitId(null)}
            onSave={(note) => {
              if (noteHabitId) handleSaveNote(noteHabitId, note);
              setNoteHabitId(null);
            }}
          />

          <ConfirmDialog
            open={!!confirmArchiveHabitId}
            title="أرشفة العادة"
            message="هل أنت متأكِّد من رغبتك في أرشفة هذه العادة؟ سيتمُّ الاحتفاظ بسجلاتك السَّابقة."
            confirmLabel="أرشفة"
            cancelLabel="إلغاء"
            onConfirm={confirmArchive}
            onCancel={cancelArchive}
          />

          <ConfirmDialog
            open={showLogoutConfirm}
            title="تسجيل الخروج"
            message="هل أنت متأكِّد من رغبتك في تسجيل الخروج؟"
            confirmLabel={isLoggingOut ? 'جارٍ تسجيل الخروج...' : 'تسجيل الخروج'}
            cancelLabel="إلغاء"
            onConfirm={signOut}
            onCancel={() => setShowLogoutConfirm(false)}
          />

          <ConfirmDialog
            open={showImportConfirm}
            title="استعادة النُّسخة الاحتياطيَّة"
            message="استعادة نسخة احتياطيَّة ستحلُّ محلَّ جميع العادات والسِّجلات الحاليَّة. هذا الإجراء لا يمكن التَّراجع عنه. هل أنت متأكِّد؟"
            confirmLabel="استعادة"
            cancelLabel="إلغاء"
            onConfirm={confirmImport}
            onCancel={cancelImport}
          />

          <ConfirmDialog
            open={showSyncConfirm}
            title="مزامنة البيانات المحلِّيَّة"
            message="سيتمُّ إرسال بياناتك المحلِّيَّة إلى السَّحابة وحلِّها محلَّ البيانات السَّحابيَّة الحاليَّة. هل أنت متأكِّد؟"
            confirmLabel="مزامنة"
            cancelLabel="إلغاء"
            onConfirm={confirmSyncToCloud}
            onCancel={cancelSyncToCloud}
          />
        </div>
      </main>
    </ErrorBoundary>
  );
}
