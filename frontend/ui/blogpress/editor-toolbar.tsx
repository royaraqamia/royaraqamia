'use client';

import type { Editor } from '@tiptap/core';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  ChevronDown,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  HelpCircle,
  ImagePlus,
  Italic,
  Link,
  List,
  ListOrdered,
  Minus,
  Redo2,
  Strikethrough,
  TextQuote,
  Undo2,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/frontend/ui/primitives/dropdown-menu';
import type { ContentStats } from '@/frontend/shared/blogpress/content-stats';

interface EditorToolbarProps {
  editorRef: React.RefObject<{ editor: Editor | null } | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onOpenLink: (href: string) => void;
  onOpenShortcuts: () => void;
  stats?: ContentStats;
}

const CODE_LANGUAGES: { value: string; label: string }[] = [
  { value: 'plaintext', label: 'نص عادي' },
  { value: 'javascript', label: 'JavaScript' },
  { value: 'typescript', label: 'TypeScript' },
  { value: 'jsx', label: 'JSX' },
  { value: 'tsx', label: 'TSX' },
  { value: 'python', label: 'Python' },
  { value: 'json', label: 'JSON' },
  { value: 'html', label: 'HTML' },
  { value: 'css', label: 'CSS' },
  { value: 'bash', label: 'Bash / Shell' },
  { value: 'sql', label: 'SQL' },
  { value: 'java', label: 'Java' },
  { value: 'cpp', label: 'C++' },
  { value: 'c', label: 'C' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust' },
  { value: 'php', label: 'PHP' },
  { value: 'ruby', label: 'Ruby' },
  { value: 'yaml', label: 'YAML' },
  { value: 'markdown', label: 'Markdown' },
];

const toolbarButtons: {
  action: string;
  icon: React.ElementType;
  label: string;
  group?: string;
}[] = [
  { action: 'undo', icon: Undo2, label: 'تراجع', group: 'history' },
  { action: 'redo', icon: Redo2, label: 'إعادة', group: 'history' },
  { action: 'bold', icon: Bold, label: 'عريض', group: 'format' },
  { action: 'italic', icon: Italic, label: 'مائل', group: 'format' },
  { action: 'strike', icon: Strikethrough, label: 'يتوسَّط', group: 'format' },
  { action: 'h1', icon: Heading1, label: 'عنوان 1', group: 'heading' },
  { action: 'h2', icon: Heading2, label: 'عنوان 2', group: 'heading' },
  { action: 'h3', icon: Heading3, label: 'عنوان 3', group: 'heading' },
  { action: 'list', icon: List, label: 'قائمة نقطيَّة', group: 'list' },
  { action: 'orderedList', icon: ListOrdered, label: 'قائمة مُرقَّمة', group: 'list' },
  { action: 'quote', icon: TextQuote, label: 'اقتباس', group: 'block' },
  { action: 'code', icon: Code2, label: 'كود', group: 'block' },
  { action: 'hr', icon: Minus, label: 'فاصل', group: 'insert' },
  { action: 'link', icon: Link, label: 'رابط', group: 'insert' },
  { action: 'image', icon: ImagePlus, label: 'صورة', group: 'insert' },
  { action: 'alignLeft', icon: AlignLeft, label: 'محاذاة لليسار', group: 'align' },
  { action: 'alignCenter', icon: AlignCenter, label: 'توسيط', group: 'align' },
  { action: 'alignRight', icon: AlignRight, label: 'محاذاة لليمين', group: 'align' },
  { action: 'shortcuts', icon: HelpCircle, label: 'اختصارات' },
];

export function EditorToolbar({
  editorRef,
  fileInputRef,
  onOpenLink,
  onOpenShortcuts,
  stats,
}: EditorToolbarProps) {
  const editor = editorRef.current?.editor;

  const isActive = (action: string) =>
    editor &&
    (action === 'bold'
      ? editor.isActive('bold')
      : action === 'italic'
        ? editor.isActive('italic')
        : action === 'strike'
          ? editor.isActive('strike')
          : action === 'h1'
            ? editor.isActive('heading', { level: 1 })
            : action === 'h2'
              ? editor.isActive('heading', { level: 2 })
              : action === 'h3'
                ? editor.isActive('heading', { level: 3 })
                : action === 'list'
                  ? editor.isActive('bulletList')
                  : action === 'orderedList'
                    ? editor.isActive('orderedList')
                    : action === 'quote'
                      ? editor.isActive('blockquote')
                      : action === 'code'
                        ? editor.isActive('codeBlock')
                        : action === 'link'
                          ? editor.isActive('link')
                          : action === 'alignLeft'
                            ? editor.isActive({ textAlign: 'left' })
                            : action === 'alignCenter'
                              ? editor.isActive({ textAlign: 'center' })
                              : action === 'alignRight'
                                ? editor.isActive({ textAlign: 'right' })
                                : false);

  const run = (action: string) => {
    if (!editor) return;
    if (action === 'image') {
      fileInputRef.current?.click();
      return;
    }
    if (action === 'link') {
      onOpenLink(editor.getAttributes('link').href ?? '');
      return;
    }
    if (action === 'undo') {
      editor.chain().focus().undo().run();
      return;
    }
    if (action === 'redo') {
      editor.chain().focus().redo().run();
      return;
    }
    if (action === 'h1') {
      editor.chain().focus().toggleHeading({ level: 1 }).run();
      return;
    }
    if (action === 'h2') {
      editor.chain().focus().toggleHeading({ level: 2 }).run();
      return;
    }
    if (action === 'h3') {
      editor.chain().focus().toggleHeading({ level: 3 }).run();
      return;
    }
    if (action === 'orderedList') {
      editor.chain().focus().toggleOrderedList().run();
      return;
    }
    if (action === 'hr') {
      editor.chain().focus().setHorizontalRule().run();
      return;
    }
    if (action === 'alignLeft') {
      editor.chain().focus().setTextAlign('left').run();
      return;
    }
    if (action === 'alignCenter') {
      editor.chain().focus().setTextAlign('center').run();
      return;
    }
    if (action === 'alignRight') {
      editor.chain().focus().setTextAlign('right').run();
      return;
    }
    const actionMap: Record<string, () => void> = {
      bold: () => editor.chain().focus().toggleBold().run(),
      italic: () => editor.chain().focus().toggleItalic().run(),
      strike: () => editor.chain().focus().toggleStrike().run(),
      list: () => editor.chain().focus().toggleBulletList().run(),
      code: () => editor.chain().focus().toggleCodeBlock().run(),
      quote: () => editor.chain().focus().toggleBlockquote().run(),
    };
    actionMap[action]?.();
  };

  const render = () => {
    let lastGroup: string | undefined;
    const elements: React.ReactNode[] = [];
    toolbarButtons.forEach((btn) => {
      const active = isActive(btn.action);

      if (btn.group && lastGroup && btn.group !== lastGroup) {
        elements.push(
          <div
            key={`sep-${btn.action}`}
            className="mx-1 h-4 w-px shrink-0 bg-border/60"
            aria-hidden="true"
          />
        );
      }
      lastGroup = btn.group;

      if (btn.action === 'shortcuts') {
        elements.push(
          <button
            key={btn.action}
            onClick={onOpenShortcuts}
            className="relative inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-all duration-150 ease-out hover:bg-muted hover:text-foreground active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
            aria-label={btn.label}
            title={btn.label}
          >
            <btn.icon className="size-4" />
          </button>
        );
        return;
      }

      elements.push(
        <button
          key={btn.action}
          onClick={() => run(btn.action)}
          className={`relative inline-flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-all duration-150 ease-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
            active
              ? 'bg-primary text-primary-foreground font-semibold shadow-xs scale-[1.02]'
              : 'text-muted-foreground hover:bg-muted/80 hover:text-foreground active:scale-95'
          }`}
          aria-label={btn.label}
          aria-pressed={Boolean(active)}
          title={btn.label}
        >
          <btn.icon className="size-4" />
        </button>
      );
    });

    if (editor?.isActive('codeBlock')) {
      const currentLang = editor.getAttributes('codeBlock').language as string | null | undefined;
      const currentLabel =
        CODE_LANGUAGES.find((l) => l.value === currentLang)?.label ?? 'plaintext';
      elements.push(
        <DropdownMenu key="code-lang">
          <DropdownMenuTrigger asChild>
            <button
              className="mx-1 inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-primary/20 bg-primary/10 px-2.5 text-xs font-medium text-primary transition-all duration-150 ease-out hover:bg-primary/20 active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
              aria-label="لغة كتلة الكود"
              title="لغة كتلة الكود"
            >
              <Code2 className="size-3.5 shrink-0" />
              <span className="max-w-28 truncate font-mono text-[11px] font-medium">
                {currentLabel}
              </span>
              <ChevronDown className="size-3 shrink-0 opacity-70" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="max-h-64 min-w-40 overflow-y-auto rounded-xl border border-border/80 bg-background/95 p-1 shadow-lg backdrop-blur-md"
          >
            {CODE_LANGUAGES.map((lang) => (
              <DropdownMenuItem
                key={lang.value}
                onClick={() =>
                  editor
                    .chain()
                    .focus()
                    .updateAttributes('codeBlock', {
                      language: lang.value === 'plaintext' ? null : lang.value,
                    })
                    .run()
                }
                className="flex cursor-pointer items-center justify-between rounded-md px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
              >
                <span>{lang.label}</span>
                {lang.value === (currentLang ?? 'plaintext') && (
                  <span className="size-1.5 rounded-full bg-primary" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      );
    }

    return elements;
  };

  return (
    <nav
      aria-label="شريط أدوات المُحرِّر"
      className="sticky top-0 z-20 flex w-full items-center justify-between gap-2 border-b border-border/60 bg-background/80 px-2.5 py-1.5 backdrop-blur-xl transition-colors sm:px-3.5"
    >
      <div className="flex items-center gap-0.5 overflow-x-auto py-0.5 scrollbar-none touch-pan-x select-none">
        {render()}
      </div>
      <div className="ms-auto flex shrink-0 items-center gap-2 border-s border-border/50 ps-2.5 text-xs text-muted-foreground">
        {stats && (
          <div
            className="hidden items-center gap-2 sm:flex"
            role="status"
            aria-label="إحصائيَّات المحتوى"
          >
            <span className="whitespace-nowrap font-medium" title="عدد الكلمات">
              {stats.words.toLocaleString('ar-u-nu-latn')} كلمة
            </span>
            <span className="text-muted-foreground/50">·</span>
            <span className="whitespace-nowrap" title="وقت القراءة">
              {stats.readingTimeMinutes} د
            </span>
            <span className="text-muted-foreground/50">·</span>
            <span className="whitespace-nowrap" title="عدد العناوين">
              {stats.headingCount} عناوين
            </span>
          </div>
        )}
        <kbd className="inline-flex items-center gap-0.5 rounded-md border border-border/80 bg-muted/60 px-2 py-0.5 font-mono text-[10px] font-semibold tracking-tight text-muted-foreground shadow-2xs transition-colors hover:border-border hover:bg-muted">
          <span>Ctrl</span>
          <span className="text-muted-foreground/60">+</span>
          <span>S</span>
        </kbd>
        <span className="hidden text-[11px] font-medium text-muted-foreground/80 sm:inline">
          حفظ
        </span>
      </div>
    </nav>
  );
}
