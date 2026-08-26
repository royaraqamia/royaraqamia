import { useDashboardData, type DashboardSeed } from './use-dashboard-data';
import { useDashboardCalendar } from './use-dashboard-calendar';
import { useDashboardForm } from './use-dashboard-form';
import { useDashboardToggle } from './use-dashboard-toggle';
import { useDashboardBackup } from './use-dashboard-backup';

export function useDashboard(seed: DashboardSeed) {
  const { habits, logs, mode, user, setHabits, setLogs, refreshData, syncUser } =
    useDashboardData(seed);

  const {
    activeDate,
    setActiveDate,
    activeStats,
    calendarGrid,
    handleDateShift,
    getReadableActiveDate,
    todayDate,
  } = useDashboardCalendar(habits, logs);

  const {
    isAddModalOpen,
    isEditModalOpen,
    selectedHabit,
    habitName,
    habitFrequency,
    habitTarget,
    habitTargetPeriod,
    habitReminderTime,
    formError,
    isSubmitting,
    confirmArchiveHabitId,
    setHabitName,
    setHabitFrequency,
    setHabitTarget,
    setHabitTargetPeriod,
    setHabitReminderTime,
    setIsAddModalOpen,
    setFormError,
    handleAddHabit,
    handleEditHabit,
    handleArchiveHabit,
    confirmArchive,
    cancelArchive,
    openEditModal,
    closeEditModal,
  } = useDashboardForm(user, setHabits, habits);

  const { togglingHabitId, skippingHabitId, handleToggleLog, handleSkipHabit, handleSaveNote } =
    useDashboardToggle(user, logs, setLogs, activeDate);

  const {
    fileInputRef,
    showImportConfirm,
    handleDownloadBackup,
    handleDownloadCsv,
    handleImportBackupFile,
    confirmImport,
    cancelImport,
  } = useDashboardBackup(refreshData);

  return {
    habits,
    logs,
    mode,
    user,
    activeDate,
    formError,
    isSubmitting,
    isAddModalOpen,
    isEditModalOpen,
    selectedHabit,
    habitName,
    habitFrequency,
    habitTarget,
    habitTargetPeriod,
    habitReminderTime,
    fileInputRef,
    activeStats,
    calendarGrid,
    setHabitName,
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
    togglingHabitId,
    skippingHabitId,
    handleDateShift,
    getReadableActiveDate,
    openEditModal,
    closeEditModal,
    syncUser,
    todayDate,
  };
}
