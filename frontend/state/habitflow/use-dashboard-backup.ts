import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { Habit, HabitLog, HabitRepository, HabitRestoreInput } from '@/shared/contracts/habitflow';
import { buildBackupCsv, buildBackupPayload } from '@/frontend/shared/habitflow/backup';
import { logger } from '@/frontend/shared/logger';

export interface DashboardBackup {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  showImportConfirm: boolean;
  handleDownloadBackup: () => Promise<void>;
  handleDownloadCsv: () => Promise<void>;
  handleImportBackupFile: (file: File) => void;
  confirmImport: () => Promise<void>;
  cancelImport: () => void;
}

function saveBlob(content: string, type: string, filename: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function useDashboardBackup(
  store: HabitRepository | null,
  refreshData: () => Promise<void>
): DashboardBackup {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false);

  const collect = async (): Promise<{ habits: Habit[]; logs: HabitLog[] }> => {
    if (!store) throw new Error('Local Store is not ready');
    const habits = await store.getHabits();
    const endDate = new Date().toISOString().slice(0, 10);
    const logs = await store.getLogs('2020-01-01', endDate);
    return { habits, logs };
  };

  const handleDownloadBackup = async () => {
    try {
      const { habits, logs } = await collect();
      const payload = buildBackupPayload(habits, logs);
      saveBlob(
        JSON.stringify(payload, null, 2),
        'application/json',
        `habitflow_backup_${new Date().toISOString().slice(0, 10)}.json`
      );
    } catch (e) {
      logger.error('Failed to download backup', { error: String(e) });
      toast.error('فشل تحميل النسخة الاحتياطية');
    }
  };

  const handleDownloadCsv = async () => {
    try {
      const { habits, logs } = await collect();
      saveBlob(
        `\uFEFF${buildBackupCsv(habits, logs)}`,
        'text/csv;charset=utf-8;',
        `habitflow_export_${new Date().toISOString().slice(0, 10)}.csv`
      );
      toast.success('تم تصدير العادات والسجلات بنجاح');
    } catch (e) {
      logger.error('Failed to export CSV', { error: String(e) });
      toast.error('فشل تصدير CSV');
    }
  };

  const handleImportBackupFile = (file: File) => {
    setPendingImportFile(file);
    setShowImportConfirm(true);
  };

  const confirmImport = async () => {
    const file = pendingImportFile;
    if (!file) return;

    try {
      if (!store) {
        toast.error('جارٍ تجهيز التخزين المحلِّي. يرجى المحاولة بعد لحظة.');
        return;
      }
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed.habits || !parsed.logs) {
        toast.error('صيغة النسخة الاحتياطية غير صالحة');
        return;
      }

      await store.restoreFromBackup(parsed as HabitRestoreInput);
      toast.success('تم استعادة النسخة الاحتياطية بنجاح');
      await refreshData();
    } catch (e: unknown) {
      toast.error((e instanceof Error && e.message) || 'فشل في قراءة ملف النسخة الاحتياطية');
    } finally {
      setPendingImportFile(null);
      setShowImportConfirm(false);
    }
  };

  const cancelImport = () => {
    setPendingImportFile(null);
    setShowImportConfirm(false);
  };

  return {
    fileInputRef,
    showImportConfirm,
    handleDownloadBackup,
    handleDownloadCsv,
    handleImportBackupFile,
    confirmImport,
    cancelImport,
  };
}
