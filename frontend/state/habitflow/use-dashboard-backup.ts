import { useRef, useState } from 'react';
import { toast } from 'sonner';
import { logger } from '@/shared/logger';

export interface DashboardBackup {
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  showImportConfirm: boolean;
  handleDownloadBackup: () => Promise<void>;
  handleImportBackupFile: (file: File) => void;
  confirmImport: () => Promise<void>;
  cancelImport: () => void;
}

export function useDashboardBackup(refreshData: () => Promise<void>): DashboardBackup {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null);
  const [showImportConfirm, setShowImportConfirm] = useState(false);

  const handleDownloadBackup = async () => {
    try {
      const { ApiClient } = await import('@/frontend/api/habitflow/habit-api');
      const data = await ApiClient.exportBackup();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `habitflow_backup_${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (e) {
      logger.error('Failed to download backup', { error: String(e) });
      toast.error('فشل تحميل النسخة الاحتياطية');
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
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (!parsed.habits || !parsed.logs) {
        toast.error('صيغة النسخة الاحتياطية غير صالحة');
        return;
      }

      const { ApiClient } = await import('@/frontend/api/habitflow/habit-api');
      await ApiClient.importBackup(parsed);
      toast.success('تم استعادة النسخة الاحتياطية بنجاح');
      setTimeout(async () => {
        await refreshData();
      }, 1500);
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
    handleImportBackupFile,
    confirmImport,
    cancelImport,
  };
}
