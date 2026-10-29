'use client';

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import type { Editor } from '@tiptap/core';
import { marked } from 'marked';
import TurndownService from 'turndown';
import {
  ArrowRight,
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
  Trash2,
  Underline,
  Undo2,
} from 'lucide-react';

import { NOTE_TITLE_MAX, type Note } from '@/shared/contracts/notes';
import type { NotesLocalStore } from '@/frontend/api/notes/local-store';
import { calculateTimeAgo } from '@/frontend/shared/format';
import { Button } from '@/frontend/ui/primitives/button';

const turndown = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
  linkStyle: 'inlined',
});

const AUTOSAVE_DELAY_MS = 500;

interface NoteEditorProps {
  note: Note;
  store: NotesLocalStore;
  onBack: () => void;
  onDelete: () => void;
}

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

/**
 * One note, editor and all.
 *
 * The body is Markdown in the store, converted at this boundary: `marked` on the
 * way in, `turndown` on the way out. Every keystroke lands in local state and a
 * short debounce writes it to the Local Store; the Outbox carries it to the
 * server whenever the browser is online, so there is no Save button to forget.
 */
export function NoteEditor({ note, store, onBack, onDelete }: NoteEditorProps) {
  const [title, setTitle] = useState(note.title);
  const [body, setBody] = useState(note.body);
  const [, forceRender] = useReducer((value: number) => value + 1, 0);

  // The last values that reached the store, so an unchanged note is not written
  // again and a pull that repaints the list does not fight the cursor.
  const savedRef = useRef({ title: note.title, body: note.body });

  // What the component currently holds. Kept in a ref as well as in state so the
  // unmount/pagehide flush can read the newest edit without re-running effects.
  const latestRef = useRef({ id: note.id, title, body });
  latestRef.current = { id: note.id, title, body };

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder: 'اكتب ملاحظتك هنا…' }),
    ],
    editorProps: {
      attributes: {
        class:
          'prose prose-sm dark:prose-invert max-w-none min-h-[45vh] w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-xl p-4 sm:p-5 selection:bg-primary/20',
        dir: 'auto',
      },
    },
    onUpdate: ({ editor: current }) => {
      setBody(turndown.turndown(current.getHTML()));
      forceRender();
    },
    onTransaction: () => forceRender(),
  });

  // The note's Markdown arrives from the store, so the document is set once the
  // editor exists. A note with no body leaves the placeholder visible.
  useEffect(() => {
    if (!editor) return;
    let cancelled = false;
    void (async () => {
      try {
        const html = note.body ? await marked.parse(note.body) : '';
        if (!cancelled) editor.commands.setContent(html, { emitUpdate: false });
      } catch {
        if (!cancelled) editor.commands.setContent(`<p>${note.body}</p>`, { emitUpdate: false });
      }
    })();
    return () => {
      cancelled = true;
    };
    // The parent keys this component by note id, so this runs once per note.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor]);

  // Autosave: the store write is the durable step, and its Outbox intent is
  // queued in the same transaction, so a closed tab cannot lose the edit.
  const flush = useCallback(() => {
    const pending = latestRef.current;
    const saved = savedRef.current;
    if (pending.title === saved.title && pending.body === saved.body) return;

    void store
      .updateNote(pending.id, { title: pending.title, body: pending.body })
      .then((updated) => {
        if (updated) savedRef.current = { title: pending.title, body: pending.body };
      })
      .catch(() => {
        // The edit stays in this component's state; the next keystroke retries.
      });
  }, [store]);

  useEffect(() => {
    const saved = savedRef.current;
    if (title === saved.title && body === saved.body) return undefined;

    const timer = setTimeout(flush, AUTOSAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [title, body, flush]);

  // The debounce is short, but closing a tab or navigating away inside it must
  // not lose the last keystroke: flush on hide and on unmount as well.
  useEffect(() => {
    const onHide = () => flush();
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', onHide);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', onHide);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      flush();
    };
  }, [flush]);

  const handleDeleteClick = useCallback(() => {
    // The unmount flush must not resurrect the note the parent is about to
    // tombstone, so mark the current values as already accounted for first.
    savedRef.current = latestRef.current;
    onDelete();
  }, [onDelete]);

  const wordCount = useMemo(() => {
    const text = body.trim();
    return text === '' ? 0 : text.split(/\s+/).length;
  }, [body]);

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
    <article className="flex min-h-[60vh] flex-col rounded-3xl border border-border/60 bg-card/60">
      <div className="flex items-center gap-2 border-b border-border/50 px-3 py-2">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="lg:hidden"
          onClick={onBack}
          aria-label="الرُّجوع إلى الملاحظات"
        >
          <ArrowRight aria-hidden="true" />
        </Button>

        <div className="min-w-0 flex-1">
          <label className="sr-only" htmlFor="note-title">
            عنوان الملاحظة
          </label>
          <input
            id="note-title"
            value={title}
            maxLength={NOTE_TITLE_MAX}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="بدون عنوان"
            className="w-full bg-transparent px-1 text-lg font-bold tracking-tight outline-none placeholder:text-muted-foreground/60"
          />
        </div>

        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={handleDeleteClick}
          aria-label="حذف الملاحظة"
          className="text-destructive hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>

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

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-border/50 px-4 py-2 text-[11px] text-muted-foreground">
        <span>يُحفظ تلقائيًّا على هذا الجهاز</span>
        <span>
          {wordCount > 0 ? `${wordCount} كلمة · ` : ''}
          آخر تعديل {calculateTimeAgo(note.updatedAt)}
        </span>
      </footer>
    </article>
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
