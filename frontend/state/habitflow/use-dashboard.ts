import { useDashboardData, type DashboardSeed } from './use-dashboard-data';
import { useDashboardCalendar } from './use-dashboard-calendar';
import { useDashboardForm } from './use-dashboard-form';
import { useDashboardToggle } from './use-dashboard-toggle';
import { useDashboardBackup } from './use-dashboard-backup';

export function useDashboard(seed: DashboardSeed) {
  const {
    habits,
    logs,
    mode,
    user,
    setHabits,
    setLogs,
    showSyncConfirm,
    confirmSyncToCloud,
    cancelSyncToCloud,
    refreshData,
    syncUser,
  } = useDashboardData(seed);

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
    habitIcon,
    habitFrequency,
    habitTarget,
    habitTargetPeriod,
    habitReminderTime,
    formError,
    isSubmitting,
    confirmArchiveHabitId,
    setHabitName,
    setHabitIcon,
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
  } = useDashboardForm(user, setHabits);

  const { togglingHabitId, skippingHabitId, handleToggleLog, handleSkipHabit, handleSaveNote } =
    useDashboardToggle(user, logs, setLogs, activeDate);

  const {
    fileInputRef,
    showImportConfirm,
    handleDownloadBackup,
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
    handleImportBackupFile,
    showImportConfirm,
    confirmImport,
    cancelImport,
    showSyncConfirm,
    confirmSyncToCloud,
    cancelSyncToCloud,
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
