'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Link2 } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import {
  chatDocToMarkdown,
  chatMarkdownToDoc,
  isSafeHref,
  type ProseMirrorNode,
} from '@/shared/text/chat-markdown';

/** The body ceiling the contract enforces; the field refuses to outgrow it. */
export const CHAT_FIELD_MAX = 4000;

/** The surface's words for the six marks: the field draws them, it does not own them. */
export interface ChatFieldLabels {
  toolbar: string;
  bold: string;
  italic: string;
  underline: string;
  strike: string;
  code: string;
  link: string;
  linkPrompt: string;
}

/**
 * The message field (ADR-0193).
 *
 * It is a rich editor holding *one* paragraph of inline marks, not a document:
 * Enter is a line break rather than a new block, because a message has no
 * blocks, and the marks are the six the bubble can draw. What the field writes
 * is the stored text — `chatDocToMarkdown` — so the words a member sends are the
 * words the bubble renders, and a message edited tomorrow opens on the same
 * marks.
 *
 * The selection bubble is Telegram's gesture, not a toolbar: select a word —
 * long-press on a phone, drag on a desktop — and the six commands appear over
 * the selection. A button acts on the press and cancels it, so the selection
 * survives the press that applies the mark.
 */
export function ChatField({
  value,
  onChange,
  onTyping,
  onDraftEmpty,
  ariaLabel,
  placeholder,
  disabled,
  compact = false,
  className,
  onFocus,
  labels,
}: {
  value: string;
  onChange: (value: string) => void;
  /** A keystroke, for the member thread's typing channel. */
  onTyping?: () => void;
  /** The field became empty: the member stopped rather than pausing. */
  onDraftEmpty?: () => void;
  ariaLabel: string;
  placeholder?: string;
  disabled?: boolean;
  /** The edit box inside a bubble: one row, no placeholder. */
  compact?: boolean;
  className?: string;
  onFocus?: () => void;
  /** The surface's words for the six marks: the field draws them, it does not own them. */
  labels: ChatFieldLabels;
}) {
  const editorRef = useRef<Editor | null>(null);
  const [bubble, setBubble] = useState<{ top: number; left: number } | null>(null);
  /** The newest value this field wrote, so an external reset is not mistaken for typing. */
  const emitted = useRef(value);

  const notify = useCallback(
    (next: string) => {
      if (next.length > CHAT_FIELD_MAX) return false;
      if (next === emitted.current) return true;
      emitted.current = next;
      onChange(next);
      if (!onTyping) return true;
      if (next.trim()) onTyping();
      else onDraftEmpty?.();
      return true;
    },
    [onChange, onDraftEmpty, onTyping]
  );

  const editor = useEditor({
    immediatelyRender: false,
    editable: !disabled,
    extensions: [
      StarterKit.configure({
        // A message is one paragraph with line breaks: no blocks, no lists.
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
      }),
      ...(placeholder ? [Placeholder.configure({ placeholder })] : []),
    ],
    content: chatMarkdownToDoc(value),
    editorProps: {
      attributes: {
        role: 'textbox',
        'aria-label': ariaLabel,
        'aria-multiline': 'true',
        dir: 'auto',
        class: cn(
          'tiptap outline-none break-words whitespace-pre-wrap',
          compact ? 'min-h-8 text-sm' : 'min-h-10 max-h-32 overflow-y-auto',
          className
        ),
      },
      // Enter is a line, never a new block and never a send.
      handleKeyDown: (_view, event) => {
        if (event.key !== 'Enter') return false;
        event.preventDefault();
        editorRef.current?.chain().setHardBreak().run();
        return true;
      },
    },
    onUpdate: ({ editor: current }) => {
      const next = chatDocToMarkdown(current.getJSON() as ProseMirrorNode);
      if (notify(next)) return;
      // Over the ceiling: put back the newest acceptable text rather than let
      // the field grow past what the contract will accept.
      current.commands.setContent(chatMarkdownToDoc(emitted.current), { emitUpdate: false });
      current.commands.focus('end');
    },
    onFocus: () => setBubble(null),
  });

  useEffect(() => {
    editorRef.current = editor ?? null;
    if (editor) editor.setEditable(!disabled);
  }, [editor, disabled]);

  // An external change — a send that clears the draft, a saved edit — reaches
  // the field here. Comparing the serialised document keeps a keystroke from
  // resetting the cursor it just moved.
  useEffect(() => {
    if (!editor) return;
    const current = chatDocToMarkdown(editor.getJSON() as ProseMirrorNode);
    if (current === value) return;
    emitted.current = value;
    editor.commands.setContent(chatMarkdownToDoc(value), { emitUpdate: false });
  }, [editor, value]);

  // The bubble follows the selection; it is a viewport coordinate, so it is
  // `fixed` and needs no scroll listener of its own.
  useEffect(() => {
    if (!editor) return;

    const place = () => {
      const selection = window.getSelection();
      if (!selection || selection.isCollapsed || selection.rangeCount === 0) {
        setBubble(null);
        return;
      }
      const range = selection.getRangeAt(0);
      if (!editor.view.dom.contains(range.commonAncestorContainer)) {
        setBubble(null);
        return;
      }
      const rect = range.getBoundingClientRect();
      if (rect.width === 0 && rect.height === 0) {
        setBubble(null);
        return;
      }
      setBubble({ top: rect.top, left: rect.left + rect.width / 2 });
    };

    document.addEventListener('selectionchange', place);
    return () => document.removeEventListener('selectionchange', place);
  }, [editor]);

  const run = (action: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => {
    if (!editor) return;
    // The callback builds the chain; this is where it is committed.
    action(editor.chain().focus()).run();
    // The selection survives a mark toggle; the bubble is re-placed on the next
    // selectionchange, which the toggle itself fires.
  };

  const setLink = () => {
    if (!editor) return;
    const previous = editor.getAttributes('link').href as string | undefined;
    const href = window.prompt(labels.linkPrompt, previous ?? 'https://');
    if (href === null) return;
    const trimmed = href.trim();
    if (trimmed === '') {
      run((chain) => chain.extendMarkRange('link').unsetLink());
      return;
    }
    if (!isSafeHref(trimmed)) return;
    run((chain) => chain.extendMarkRange('link').setLink({ href: trimmed, class: 'mention' }));
  };

  if (!editor) {
    return (
      <div
        className={cn('animate-pulse rounded-xl bg-muted/30', compact ? 'h-8' : 'h-10', className)}
        aria-hidden="true"
      />
    );
  }

  return (
    <div className="relative w-full" onFocusCapture={onFocus}>
      <EditorContent editor={editor} />

      {bubble && !disabled ? (
        <div
          role="toolbar"
          aria-label={labels.toolbar}
          // Above the selection, centred on it. `fixed` because the rect is a
          // viewport coordinate, and `pointer-events-auto` because the bubble
          // must not be clipped by the field's own scroll box.
          style={{ top: Math.max(8, bubble.top - 46), left: bubble.left }}
          className="fixed z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-border/70 bg-popover px-1 py-0.5 shadow-lg"
          // The press that applies a mark must not move focus out of the field:
          // `mousedown` is where a button takes it, and cancelling *that* keeps
          // the selection while still letting the press through.
          onMouseDown={(event) => event.preventDefault()}
        >
          <FormatButton
            label={labels.bold}
            active={editor.isActive('bold')}
            onClick={() => run((chain) => chain.toggleBold())}
          >
            <span aria-hidden className="text-[13px] font-bold">
              B
            </span>
          </FormatButton>
          <FormatButton
            label={labels.italic}
            active={editor.isActive('italic')}
            onClick={() => run((chain) => chain.toggleItalic())}
          >
            <span aria-hidden className="text-[13px] italic">
              I
            </span>
          </FormatButton>
          <FormatButton
            label={labels.underline}
            active={editor.isActive('underline')}
            onClick={() => run((chain) => chain.toggleUnderline())}
          >
            <span aria-hidden className="text-[13px] underline underline-offset-2">
              U
            </span>
          </FormatButton>
          <FormatButton
            label={labels.strike}
            active={editor.isActive('strike')}
            onClick={() => run((chain) => chain.toggleStrike())}
          >
            <span aria-hidden className="text-[13px] line-through">
              S
            </span>
          </FormatButton>
          <FormatButton
            label={labels.code}
            active={editor.isActive('code')}
            onClick={() => run((chain) => chain.toggleCode())}
          >
            <span aria-hidden className="font-mono text-[10px]">
              {'</>'}
            </span>
          </FormatButton>
          <FormatButton label={labels.link} active={editor.isActive('link')} onClick={setLink}>
            <Link2 size={14} />
          </FormatButton>
        </div>
      ) : null}
    </div>
  );
}

function FormatButton({
  label,
  active,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={active}
      // The press is the action: by the time a `click` fires the field may have
      // lost the selection it was meant to mark. Keyboard activation has no
      // press, so it keeps its own path.
      onPointerDown={(event) => {
        event.preventDefault();
        onClick();
      }}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onClick();
      }}
      className={cn(
        'inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-safe hover:bg-muted/70 hover:text-foreground',
        active && 'bg-primary/10 text-primary'
      )}
    >
      {children}
    </button>
  );
}
