'use client';

import { useEffect, useMemo, useState } from 'react';
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
  FileSpreadsheet,
  Upload,
  Calendar as CalendarIcon,
  Database,
} from 'lucide-react';
import { ErrorBoundary } from '@/frontend/ui/shared/error-boundary';
import { Habit, HabitLog } from '@/shared/contracts/habitflow';
import { useDashboard } from '@/frontend/state/habitflow/use-dashboard';
import { useLogout } from '@/frontend/state/use-logout';
import { useSession } from '@/frontend/state/session-provider';
import { Button } from '@/frontend/ui/primitives/button';
import { StatsCard } from '@/frontend/ui/habitflow/components/stats-card';
import { HabitCard } from '@/frontend/ui/habitflow/components/habit-card';
import { CalendarGrid } from '@/frontend/ui/habitflow/components/calendar-grid';
import { AddHabitModal } from '@/frontend/ui/habitflow/components/add-habit-modal';
import { EditHabitModal } from '@/frontend/ui/habitflow/components/edit-habit-modal';
import { NotesDialog } from '@/frontend/ui/habitflow/components/notes-dialog';
import { HabitOnboarding } from '@/frontend/ui/habitflow/components/habit-onboarding';
import { InsightsRow } from '@/frontend/ui/habitflow/components/insights-row';
import type { HabitTemplate } from '@/frontend/shared/habitflow/habit-templates';
import { calculateInsights } from '@/frontend/shared/habitflow/habit-insights';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';

interface DashboardShellProps {
  initialHabits: Habit[];
  initialLogs: HabitLog[];
  initialMode: 'supabase' | 'local';
  initialUser: unknown;
  autoOpenCreate?: boolean;
}

export function DashboardShell({
  initialHabits,
  initialLogs,
  initialMode,
  initialUser,
  autoOpenCreate = false,
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
    habitTarget,
    habitTargetPeriod,
    habitReminderTime,
    fileInputRef,
    activeStats,
    calendarGrid,
    setHabitName,
    setHabitIcon,
    setHabitFrequency,
    setHabitTarget,
    setHabitTargetPeriod,
    setHabitReminderTime,
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
    handleDownloadCsv,
    handleImportBackupFile,
    showImportConfirm,
    confirmImport,
    cancelImport,
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

  useEffect(() => {
    if (autoOpenCreate) setIsAddModalOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoOpenCreate]);

  const shouldReduce = useReducedMotion();
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [noteHabitId, setNoteHabitId] = useState<string | null>(null);
  const { signOut, isLoggingOut } = useLogout();

  const insights = useMemo(
    () => calculateInsights(habits, logs, todayDate),
    [habits, logs, todayDate]
  );

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
        className="min-h-screen text-zinc-900 dark:text-zinc-50 selection:bg-primary/20 selection:text-primary transition-colors duration-500 font-sans"
        dir="rtl"
      >
        <div className="max-w-350 mx-auto px-4 sm:px-6 md:px-8 py-8 sm:py-12 flex flex-col gap-10 lg:gap-14">
          {/* Header & Date Navigation Toolbar */}
          <motion.header
            initial={shouldReduce ? false : { opacity: 0, y: -15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={shouldReduce ? undefined : { type: 'spring', stiffness: 280, damping: 25 }}
            className="flex flex-col md:flex-row md:items-end justify-between gap-6 pb-8 border-b border-zinc-200/60 dark:border-zinc-800/60"
          >
            <div className="flex flex-col gap-3">
              <h1 className="text-4xl sm:text-5xl font-bold tracking-tight bg-linear-to-b from-zinc-900 to-zinc-600 dark:from-white dark:to-zinc-400 bg-clip-text text-transparent">
                إدارة العادات
              </h1>
            </div>

            <div className="flex items-center gap-4 self-start md:self-auto flex-wrap sm:flex-nowrap">
              {/* Apple-style Segmented Date Control */}
              <div className="flex items-center bg-white/70 dark:bg-zinc-900/70 backdrop-blur-2xl border border-zinc-200/80 dark:border-zinc-800/80 rounded-full p-1.5 shadow-sm transition-all hover:border-zinc-300 dark:hover:border-zinc-700">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleDateShift(-1)}
                  aria-label="اليوم السَّابق"
                  id="btn-prev-day"
                  className="size-9 rounded-full text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all duration-300 ease-out active:scale-90 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>

                <div className="flex items-center gap-2 px-4 py-1">
                  <CalendarIcon className="w-4 h-4 text-zinc-400 dark:text-zinc-500" />
                  <span
                    className="text-sm font-semibold text-zinc-800 dark:text-zinc-200 whitespace-nowrap min-w-30 text-center select-none tracking-wide"
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
                  className="size-9 rounded-full text-zinc-500 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-all duration-300 ease-out active:scale-90 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
              </div>

              <motion.div
                initial={false}
                animate={{
                  opacity: activeDate !== todayDate ? 1 : 0,
                  scale: activeDate !== todayDate ? 1 : 0.8,
                  filter: activeDate !== todayDate ? 'blur(0px)' : 'blur(4px)',
                }}
                transition={{ duration: 0.3, ease: 'easeOut' }}
                className={activeDate !== todayDate ? '' : 'pointer-events-none'}
              >
                <Button
                  variant="outline"
                  onClick={() => setActiveDate(todayDate)}
                  aria-label="العودة إلى اليوم"
                  className="h-12 rounded-full px-5 border-zinc-200/80 dark:border-zinc-800/80 bg-white/50 dark:bg-zinc-900/50 backdrop-blur-md hover:bg-zinc-50 dark:hover:bg-zinc-800 text-sm font-semibold shadow-sm transition-all duration-300 active:scale-[0.97] cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/50 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950"
                >
                  اليوم
                </Button>
              </motion.div>
            </div>
          </motion.header>

          {/* Stats Section */}
          <section aria-label="إحصائيَّات العادات" className="w-full">
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

          {insights && (
            <div className="w-full">
              <InsightsRow insights={insights} />
            </div>
          )}

          {/* Main Workspace Layout */}
          <motion.div
            initial={shouldReduce ? false : { opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.05 }}
            transition={shouldReduce ? undefined : { duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="grid grid-cols-1 lg:grid-cols-12 gap-8 xl:gap-12 items-start"
          >
            {/* Habits List Column */}
            <section
              className="lg:col-span-7 xl:col-span-8 flex flex-col gap-6"
              aria-label="قائمة العادات"
            >
              <div className="flex items-center justify-between gap-4 pb-2 border-b border-transparent">
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
                    قائمة عادات اليوم
                  </h2>
                  {habits.length > 0 && (
                    <span className="inline-flex items-center justify-center px-3 py-0.5 text-xs font-bold rounded-full bg-zinc-200/50 dark:bg-zinc-800/50 text-zinc-600 dark:text-zinc-300 border border-zinc-300/50 dark:border-zinc-700/50 backdrop-blur-sm">
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
                  className="group rounded-full shadow-sm hover:shadow-md hover:shadow-primary/20 transition-all duration-300 ease-out hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.97] bg-primary text-primary-foreground font-semibold h-11 px-5 text-sm flex items-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-zinc-950"
                >
                  <Plus className="w-4 h-4 transition-transform group-hover:rotate-90 duration-300 ease-out" />
                  <span>إضافة عادة</span>
                  <kbd className="hidden sm:inline-flex items-center justify-center min-w-5.5 h-5 px-1 rounded text-[10px] font-mono font-bold bg-white/20 dark:bg-black/20 border border-white/20 dark:border-black/20 shadow-[0_1px_0_rgba(255,255,255,0.2)] dark:shadow-none">
                    N
                  </kbd>
                </Button>
              </div>

              {habits.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4 }}
                >
                  <HabitOnboarding
                    onTemplateSelect={(template: HabitTemplate) => {
                      setHabitName(template.name);
                      setHabitIcon(template.icon);
                      setHabitFrequency(template.frequency);
                      setFormError('');
                      setIsAddModalOpen(true);
                    }}
                    onCreateBlank={() => {
                      setHabitName('');
                      setHabitIcon('Activity');
                      setHabitFrequency('daily');
                      setFormError('');
                      setIsAddModalOpen(true);
                    }}
                  />
                </motion.div>
              ) : (
                <div className="flex flex-col gap-4">
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
              <div className="sticky top-8 rounded-3xl border border-zinc-200/70 dark:border-zinc-800/70 bg-white/60 dark:bg-zinc-900/60 backdrop-blur-2xl p-6 sm:p-8 shadow-sm transition-colors duration-300 hover:border-zinc-300/80 dark:hover:border-zinc-700/80">
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
            className="mt-4 rounded-3xl border border-zinc-200/60 dark:border-zinc-800/60 bg-linear-to-r from-zinc-100/50 via-white/50 to-zinc-50/50 dark:from-zinc-900/50 dark:via-zinc-900/30 dark:to-zinc-950/50 backdrop-blur-xl p-6 sm:p-8 shadow-sm transition-all hover:shadow-md hover:border-zinc-300/80 dark:hover:border-zinc-700/80 group"
          >
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-2xl bg-white dark:bg-zinc-800 border border-zinc-200/80 dark:border-zinc-700/80 text-zinc-600 dark:text-zinc-300 shadow-sm group-hover:scale-105 transition-transform duration-300 ease-out">
                  <Database className="w-6 h-6" />
                </div>
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-zinc-900 dark:text-zinc-100 tracking-wide">
                    النَّسخ الاحتياطي وإدارة البيانات
                  </h3>
                  <p className="text-xs sm:text-sm text-zinc-500 dark:text-zinc-400">
                    تصدير أو استعادة جميع بيانات عاداتك وسجلاتك السَّابقة بأمان
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-3 self-stretch sm:self-auto">
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
                  onClick={() => fileInputRef.current?.click()}
                  aria-controls="file-input-ref"
                  className="flex-1 sm:flex-none rounded-xl border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 font-semibold h-11 px-4 text-xs sm:text-sm flex items-center justify-center gap-2 transition-all duration-300 active:scale-95 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <Upload className="w-4 h-4" />
                  <span>استيراد</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDownloadBackup}
                  className="flex-1 sm:flex-none rounded-xl border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 font-semibold h-11 px-4 text-xs sm:text-sm flex items-center justify-center gap-2 transition-all duration-300 active:scale-95 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <Download className="w-4 h-4" />
                  <span>تصدير</span>
                </Button>
                <Button
                  variant="outline"
                  onClick={handleDownloadCsv}
                  className="flex-1 sm:flex-none rounded-xl border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-zinc-900/50 hover:bg-zinc-100 dark:hover:bg-zinc-800 text-zinc-700 dark:text-zinc-200 font-semibold h-11 px-4 text-xs sm:text-sm flex items-center justify-center gap-2 transition-all duration-300 active:scale-95 cursor-pointer focus-visible:ring-2 focus-visible:ring-primary/50"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  <span>تصدير CSV</span>
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
            habitTarget={habitTarget}
            habitTargetPeriod={habitTargetPeriod}
            habitReminderTime={habitReminderTime}
            formError={formError}
            isSubmitting={isSubmitting}
            onClose={() => {
              setIsAddModalOpen(false);
              setFormError('');
            }}
            onNameChange={setHabitName}
            onIconChange={setHabitIcon}
            onFrequencyChange={setHabitFrequency}
            onTargetChange={setHabitTarget}
            onTargetPeriodChange={setHabitTargetPeriod}
            onReminderTimeChange={setHabitReminderTime}
            onSubmit={handleAddHabit}
          />

          <EditHabitModal
            isOpen={isEditModalOpen}
            habit={selectedHabit}
            habitName={habitName}
            habitIcon={habitIcon}
            habitFrequency={habitFrequency}
            habitTarget={habitTarget}
            habitTargetPeriod={habitTargetPeriod}
            habitReminderTime={habitReminderTime}
            formError={formError}
            isSubmitting={isSubmitting}
            onClose={closeEditModal}
            onNameChange={setHabitName}
            onIconChange={setHabitIcon}
            onFrequencyChange={setHabitFrequency}
            onTargetChange={setHabitTarget}
            onTargetPeriodChange={setHabitTargetPeriod}
            onReminderTimeChange={setHabitReminderTime}
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
            open={false}
            title={''}
            message={''}
            confirmLabel={''}
            cancelLabel={''}
            onConfirm={function (): void {
              throw new Error('Function not implemented.');
            }}
            onCancel={function (): void {
              throw new Error('Function not implemented.');
            }}
          />
        </div>
      </main>
    </ErrorBoundary>
  );
}
