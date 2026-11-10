'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '@/frontend/ui/primitives/button';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { DialogActions } from '@/frontend/ui/shared/dialog-actions';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/frontend/ui/primitives/dialog';
import { LoaderCircle, Upload, CloudUpload, FileText, Share2 } from 'lucide-react';
import { SPENDTRACK_CSV_COPY } from './spendtrack-csv-copy';
import { exportExpensesCsv, importExpensesCsv } from '@/frontend/api/spendtrack';

export function CsvActions({
  start,
  end,
  categories,
}: {
  start: string;
  end: string;
  categories: string[];
}) {
  const router = useRouter();
  const [importOpen, setImportOpen] = useState(false);
  const [importing, setImporting] = useState(false);
  const [exporting, setExporting] = useState(false);
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

  function saveFile(file: File) {
    const url = URL.createObjectURL(file);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = file.name;
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
    URL.revokeObjectURL(url);
  }

  async function handleExport() {
    setExporting(true);
    try {
      const content = await exportExpensesCsv({ start, end, categories });
      const file = new File([content], 'spendtrack.csv', { type: 'text/csv;charset=utf-8;' });
      // The page downloads where the platform cannot share a file; the app always
      // hands it to the share sheet, and both hand over this same content.
      if (navigator.canShare?.({ files: [file] })) {
        try {
          await navigator.share({ files: [file], title: SPENDTRACK_CSV_COPY.exportTitle });
          return;
        } catch (error) {
          if (error instanceof DOMException && error.name === 'AbortError') return;
        }
      }
      saveFile(file);
    } catch {
      toast.error(SPENDTRACK_CSV_COPY.exportFailed);
    } finally {
      setExporting(false);
    }
  }

  async function handleImport() {
    if (!fileContent.trim()) {
      toast.error(SPENDTRACK_CSV_COPY.chooseFirst);
      return;
    }
    setImporting(true);
    const result = await importExpensesCsv(fileContent);
    setImporting(false);
    if ('error' in result) {
      toast.error(result.error || SPENDTRACK_CSV_COPY.failed);
      return;
    }
    toast.success(SPENDTRACK_CSV_COPY.imported.replace('{count}', String(result.imported)), {
      description:
        result.errors.length > 0
          ? SPENDTRACK_CSV_COPY.skipped.replace('{count}', String(result.skipped))
          : undefined,
    });
    setImportOpen(false);
    setFileContent('');
    setFileName(null);
    router.refresh();
  }

  return (
    <>
      <div data-visual="spendtrack-csv" className="flex w-full sm:w-auto items-center gap-2">
        <Button
          data-visual="spendtrack-csv-import"
          variant="outline"
          size="sm"
          type="button"
          onClick={() => setImportOpen(true)}
          className="h-10 flex-1 sm:flex-none px-3.5 gap-2 text-xs sm:text-sm font-medium rounded-xl border-border/80 hover:bg-accent active:scale-95 transition-safe"
        >
          <Upload className="size-4" />
          {SPENDTRACK_CSV_COPY.action}
        </Button>
        <Button
          data-visual="spendtrack-csv-export"
          variant="outline"
          size="sm"
          type="button"
          onClick={handleExport}
          disabled={exporting}
          className="h-10 flex-1 sm:flex-none px-3.5 gap-2 text-xs sm:text-sm font-medium rounded-xl border-border/80 hover:bg-accent active:scale-95 transition-safe"
        >
          {exporting ? (
            <LoaderCircle className="size-4 animate-spin shrink-0" />
          ) : (
            <Share2 className="size-4" />
          )}
          {exporting ? SPENDTRACK_CSV_COPY.exporting : SPENDTRACK_CSV_COPY.exportAction}
        </Button>
      </div>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="sm:max-w-lg rounded-2xl border-border/80 bg-background p-6 shadow-2xl">
          <DialogHeader className="space-y-2 text-start">
            <DialogTitle className="text-lg font-bold text-foreground">
              {SPENDTRACK_CSV_COPY.title}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
              {SPENDTRACK_CSV_COPY.columnsHint}
              <span
                dir="ltr"
                className="inline-block font-mono text-xs bg-muted/60 px-1.5 py-0.5 rounded ms-1"
              >
                date, amount, category, description
              </span>
              <br />
              {SPENDTRACK_CSV_COPY.rules}
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
            <CloudUpload className="size-6 text-muted-foreground transition-colors group-hover:text-primary" />
            <span className="text-sm font-medium text-muted-foreground">
              {fileName ?? SPENDTRACK_CSV_COPY.pickFile}
            </span>
            {fileName && (
              <span className="flex items-center gap-1.5 text-xs font-medium text-primary">
                <FileText className="size-3.5" />
                {fileName}
              </span>
            )}
          </label>

          <DialogActions
            onCancel={() => {
              setImportOpen(false);
              setFileContent('');
              setFileName(null);
            }}
            className="pt-4"
          >
            <HeroCtaButton
              type="button"
              onClick={handleImport}
              disabled={importing || !fileContent.trim()}
              className="w-full sm:w-auto"
            >
              {importing ? (
                <>
                  <LoaderCircle className="size-4 animate-spin shrink-0" />
                  <span>{SPENDTRACK_CSV_COPY.importing}</span>
                </>
              ) : (
                SPENDTRACK_CSV_COPY.action
              )}
            </HeroCtaButton>
          </DialogActions>
        </DialogContent>
      </Dialog>
    </>
  );
}
