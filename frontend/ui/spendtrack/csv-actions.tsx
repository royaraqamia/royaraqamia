'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/frontend/ui/primitives/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/frontend/ui/primitives/dialog';
import { Loader2, Upload, UploadCloud, FileText } from 'lucide-react';
import { importExpensesCsv } from '@/frontend/api/spendtrack';

export function CsvActions() {
  const router = useRouter();
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');

  function handleFileChange(file: File | null) {
    if (!file) {
      setFileName(null);
      setFileContent('');
      return;
    }
    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = () => setFileContent(String(reader.result ?? ''));
    reader.readAsText(file);
  }

  async function handleImport() {
    if (!fileContent.trim()) {
      toast.error('اختر ملف CSV أولًا');
      return;
    }
    setImporting(true);
    const result = await importExpensesCsv(fileContent);
    setImporting(false);
    if ('error' in result) {
      toast.error(result.error);
      return;
    }
    toast.success(`تم استيراد ${result.imported} مصروف`, {
      description:
        result.errors.length > 0 ? `تم تخطّي ${result.skipped} صفًا غير صالح` : undefined,
    });
    setImportOpen(false);
    setFileContent('');
    setFileName(null);
    router.refresh();
  }

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        type="button"
        onClick={() => setImportOpen(true)}
        className="h-10 px-3.5 gap-2 text-xs sm:text-sm font-medium rounded-xl border-border/80 hover:bg-accent active:scale-95 transition-safe"
      >
        <Upload className="size-4" />
        استيراد
      </Button>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl border-border/80 bg-background p-6 shadow-2xl">
          <DialogHeader className="space-y-2 text-start">
            <DialogTitle className="text-lg font-bold text-foreground">
              استيراد المصاريف
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
              ارفع ملف CSV بالأعمدة:
              <span
                dir="ltr"
                className="inline-block font-mono text-xs bg-muted/60 px-1.5 py-0.5 rounded ms-1"
              >
                date, amount, category, description
              </span>
              <br />
              الصفوف السليمة تُضاف، وتُتجاهل الصفوف غير الصالحة، وتُنشأ التصنيفات الجديدة تلقائيًا.
            </DialogDescription>
          </DialogHeader>

          <label
            htmlFor="spend-csv-file"
            className="group relative mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border/80 bg-muted/20 p-6 text-center transition-colors hover:border-primary/50 hover:bg-primary/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
          >
            <input
              id="spend-csv-file"
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              onChange={(e) => handleFileChange(e.target.files?.[0] ?? null)}
            />
            <UploadCloud className="size-6 text-muted-foreground transition-colors group-hover:text-primary" />
            <span className="text-sm font-medium text-muted-foreground">
              {fileName ?? 'اختر ملف CSV للاستيراد'}
            </span>
            {fileName && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
                <FileText className="size-3.5" />
                {fileName}
              </span>
            )}
          </label>

          <div className="flex items-center justify-end gap-2.5 pt-4">
            <Button
              variant="outline"
              type="button"
              onClick={() => {
                setImportOpen(false);
                setFileContent('');
                setFileName(null);
              }}
              className="h-9 px-4 text-xs font-medium rounded-xl border-border/80 hover:bg-accent active:scale-95 transition-safe"
            >
              إلغاء
            </Button>
            <Button
              type="button"
              onClick={handleImport}
              disabled={importing || !fileContent.trim()}
              className="h-9 px-4 text-xs font-medium rounded-xl shadow-sm active:scale-95 transition-safe"
            >
              {importing ? (
                <span className="flex items-center gap-1.5">
                  <Loader2 className="size-3.5 animate-spin" />
                  جاري الاستيراد...
                </span>
              ) : (
                'استيراد'
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
