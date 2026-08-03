'use client';

import type { Editor } from '@tiptap/core';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
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

interface EditorToolbarProps {
  editorRef: React.RefObject<{ editor: Editor | null } | null>;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onOpenLink: (href: string) => void;
  onOpenShortcuts: () => void;
}

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
  { action: 'strike', icon: Strikethrough, label: 'يتوسّط', group: 'format' },
  { action: 'h1', icon: Heading1, label: 'عنوان 1', group: 'heading' },
  { action: 'h2', icon: Heading2, label: 'عنوان 2', group: 'heading' },
  { action: 'h3', icon: Heading3, label: 'عنوان 3', group: 'heading' },
  { action: 'list', icon: List, label: 'قائمة نقطية', group: 'list' },
  { action: 'orderedList', icon: ListOrdered, label: 'قائمة مرقّمة', group: 'list' },
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
          <div key={`sep-${btn.action}`} className="w-px h-5 bg-border/40 mx-1 shrink-0" />
        );
      }
      lastGroup = btn.group;

      if (btn.action === 'shortcuts') {
        elements.push(
          <button
            key={btn.action}
            onClick={onOpenShortcuts}
            className="size-8 rounded-full flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-muted transition-all shrink-0 cursor-pointer"
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
          className={`size-8 rounded-full flex items-center justify-center transition-all shrink-0 cursor-pointer ${
            active
              ? 'bg-primary/15 text-primary shadow-xs'
              : 'text-muted-foreground hover:text-foreground hover:bg-muted'
          }`}
          aria-label={btn.label}
          title={btn.label}
        >
          <btn.icon className="size-4" />
        </button>
      );
    });
    return elements;
  };

  return (
    <div className="flex items-center gap-0.5 px-3 py-1.5 border-b border-border/50 bg-muted/30 overflow-x-auto scrollbar-hide">
      {render()}
      <div className="me-auto flex items-center gap-2 text-xs text-muted-foreground/50">
        <kbd className="px-1.5 py-0.5 rounded bg-muted/50 text-[10px] font-mono">Ctrl+S</kbd>
        <span>حفظ</span>
      </div>
    </div>
  );
}
