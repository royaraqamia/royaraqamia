'use client';

import { useEffect, useId, useReducer, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import type { Editor } from '@tiptap/core';
import { marked } from 'marked';
import TurndownService from 'turndown';
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Italic,
  Link2,
  List,
  ListOrdered,
  Quote,
  Redo2,
  Strikethrough,
  Underline,
  Undo2,
} from 'lucide-react';

import { Button } from '@/frontend/ui/primitives/button';
import { cn } from '@/frontend/shared/cn';

const turndown = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
  linkStyle: 'inlined',
});

function toggleLink(editor: Editor) {
  const previous = editor.getAttributes('link').href as string | undefined;
  const href = window.prompt('عنوان الرَّابط', previous ?? 'https://');
  if (href === null) return;
  if (href.trim() === '') {
    editor.chain().focus().extendMarkRange('link').unsetLink().run();
    return;
  }
  editor.chain().focus().extendMarkRange('link').setLink({ href: href.trim() }).run();
}

interface NoteBodyEditorProps {
  /** The Markdown the document opens with; the editor owns it from then on. */
  initialMarkdown: string;
  /** Receives the document as Markdown on every edit. */
  onChange: (markdown: string) => void;
  placeholder?: string;
  /** The editable surface's id, so a `<Label htmlFor>` can name it. */
  id?: string;
  /** The accessible name of the editable surface. */
  ariaLabel?: string;
  /** Height of the editable surface. */
  surfaceClassName?: string;
  className?: string;
}

/**
 * The rich-text half of a note: Tiptap renders the document, `marked` converts
 * the stored Markdown on the way in and `turndown` converts it back on the way
 * out, so the store keeps one plain format whichever surface opened the note —
 * the editor pane or the composer dialog.
 */
export function NoteBodyEditor({
  initialMarkdown,
  onChange,
  placeholder = 'اكتب ملاحظتك هنا…',
  id,
  ariaLabel = 'نصّ الملاحظة',
  surfaceClassName = 'min-h-[45vh]',
  className,
}: NoteBodyEditorProps) {
  const [, forceRender] = useReducer((value: number) => value + 1, 0);
  const generatedId = useId();
  const surfaceId = id ?? generatedId;

  // The editor outlives any single render, so it reads the newest callback from
  // a ref rather than capturing the one it was created with.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder }),
    ],
    editorProps: {
      attributes: {
        id: surfaceId,
        'aria-label': ariaLabel,
        class: cn(
          'prose prose-sm dark:prose-invert max-w-none w-full rounded-xl p-4 sm:p-5 selection:bg-primary/20 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
          surfaceClassName
        ),
        dir: 'auto',
      },
    },
    onUpdate: ({ editor: current }) => {
      onChangeRef.current(turndown.turndown(current.getHTML()));
      forceRender();
    },
    onTransaction: () => forceRender(),
  });

  // The document arrives as Markdown, so it is set once the editor exists. An
  // empty note leaves the placeholder visible.
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    void (async () => {
      try {
        const html = initialMarkdown ? await marked.parse(initialMarkdown) : '';
        if (!cancelled) editor.commands.setContent(html, { emitUpdate: false });
      } catch {
        if (!cancelled)
          editor.commands.setContent(`<p>${initialMarkdown}</p>`, { emitUpdate: false });
      }
    })();
    return () => {
      cancelled = true;
    };
    // The document is the one the caller opened with: a later `initialMarkdown`
    // belongs to another note, and the caller keys this component by note id.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  if (!editor) {
    return (
      <div className="space-y-4 p-4" aria-busy="true" aria-label="جاري فتح المحرِّر">
        <div className="h-10 w-2/3 animate-pulse rounded-xl bg-muted/40" />
        <div className="h-4 w-full animate-pulse rounded-lg bg-muted/30" />
        <div className="h-4 w-5/6 animate-pulse rounded-lg bg-muted/30" />
        <div className="h-40 w-full animate-pulse rounded-xl bg-muted/20" />
      </div>
    );
  }

  return (
    <div className={cn('flex min-h-0 flex-1 flex-col', className)}>
      <div
        role="toolbar"
        aria-label="تنسيق النَّصّ"
        className="flex flex-wrap items-center gap-0.5 border-b border-border/50 px-2 py-1.5"
      >
        <ToolbarButton
          label="عريض"
          active={editor.isActive('bold')}
          onClick={() => editor.chain().focus().toggleBold().run()}
          icon={Bold}
        />
        <ToolbarButton
          label="مائل"
          active={editor.isActive('italic')}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          icon={Italic}
        />
        <ToolbarButton
          label="تسطير"
          active={editor.isActive('underline')}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          icon={Underline}
        />
        <ToolbarButton
          label="يتوسطه خط"
          active={editor.isActive('strike')}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          icon={Strikethrough}
        />
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border/70" />
        <ToolbarButton
          label="عنوان رئيسيّ"
          active={editor.isActive('heading', { level: 1 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}
          icon={Heading1}
        />
        <ToolbarButton
          label="عنوان فرعيّ"
          active={editor.isActive('heading', { level: 2 })}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
          icon={Heading2}
        />
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border/70" />
        <ToolbarButton
          label="قائمة نقطيَّة"
          active={editor.isActive('bulletList')}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          icon={List}
        />
        <ToolbarButton
          label="قائمة مرقَّمة"
          active={editor.isActive('orderedList')}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          icon={ListOrdered}
        />
        <ToolbarButton
          label="اقتباس"
          active={editor.isActive('blockquote')}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          icon={Quote}
        />
        <ToolbarButton
          label="كتلة كود"
          active={editor.isActive('codeBlock')}
          onClick={() => editor.chain().focus().toggleCodeBlock().run()}
          icon={Code}
        />
        <ToolbarButton
          label="رابط"
          active={editor.isActive('link')}
          onClick={() => toggleLink(editor)}
          icon={Link2}
        />
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-border/70" />
        <ToolbarButton
          label="تراجع"
          onClick={() => editor.chain().focus().undo().run()}
          icon={Undo2}
        />
        <ToolbarButton
          label="إعادة"
          onClick={() => editor.chain().focus().redo().run()}
          icon={Redo2}
        />
      </div>

      <EditorContent editor={editor} className="flex-1" />
    </div>
  );
}

interface ToolbarButtonProps {
  label: string;
  icon: typeof Bold;
  onClick: () => void;
  active?: boolean;
}

function ToolbarButton({ label, icon: Icon, onClick, active }: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      onClick={onClick}
      className={active ? 'bg-primary/10 text-primary' : undefined}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}
