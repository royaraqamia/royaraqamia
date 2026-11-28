'use client';

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { EditorContent, useEditor, type Editor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { Keyboard, Link2, Smile } from 'lucide-react';

import { cn } from '@/frontend/shared/cn';
import {
  chatDocToMarkdown,
  chatMarkdownToDoc,
  isSafeHref,
  type ProseMirrorNode,
} from '@/shared/text/chat-markdown';
import type { ChatEmojiLabels } from './emoji-catalog';
import { prefetchEmojiPicker } from './emoji-tray';

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
  /**
   * The emoji sheet's words. A surface that leaves them out draws no smiley —
   * the bubble a line is edited in is not a composer, and asking it to word a
   * picker nobody opens would be copy the pair check cannot see.
   */
  emoji?: ChatEmojiLabels;
}

/**
 * What a composer's emoji tray writes through.
 *
 * The tray sits below the composer's row rather than inside the field, because
 * a composer owns what sits under it; the field is the only thing that knows
 * where the caret is, so the composer asks it by name (ADR-0225's 2026-11-28
 * amendment).
 */
export interface ChatFieldHandle {
  /** Writes a glyph at the caret, which the tray's press did not move. */
  insertEmoji: (glyph: string) => void;
  /** Puts the caret back in the field, raising the keyboard on a phone. */
  focus: () => void;
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
interface ChatFieldProps {
  value: string;
  onChange: (value: string) => void;
  /**
   * The surface's own ceiling — `CHAT_BODY_MAX` here, `POST_COMMENT_MAX_LENGTH`
   * on a post's thread. The editor refuses to outgrow what the server accepts.
   */
  maxLength: number;
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
  /** Whether the composer's tray is open, so the smiley is the switch back. */
  emojiOpen?: boolean;
  /** The smiley asks the composer to open or close the tray it draws. */
  onEmojiOpenChange?: (open: boolean) => void;
}

export const ChatField = forwardRef<ChatFieldHandle, ChatFieldProps>(function ChatField(
  {
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
    maxLength,
    emojiOpen = false,
    onEmojiOpenChange,
  },
  ref
) {
  const editorRef = useRef<Editor | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const bubbleRef = useRef<HTMLDivElement | null>(null);
  const [bubble, setBubble] = useState<{ top: number; left: number } | null>(null);
  /** The bubble a line is edited in is not a composer, so it draws no smiley. */
  const offersEmoji = Boolean(labels.emoji) && Boolean(onEmojiOpenChange) && !compact && !disabled;
  /** The newest value this field wrote, so an external reset is not mistaken for typing. */
  const emitted = useRef(value);

  const notify = useCallback(
    (next: string) => {
      if (next.length > maxLength) return false;
      if (next === emitted.current) return true;
      emitted.current = next;
      onChange(next);
      if (!onTyping) return true;
      if (next.trim()) onTyping();
      else onDraftEmpty?.();
      return true;
    },
    [maxLength, onChange, onDraftEmpty, onTyping]
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
        // A message field is a control, not prose.
        //
        // The base sheet sizes every paragraph as body copy
        // (`--type-body-size`, a fluid 16-18px at 1.6 leading), and that rule
        // outranks the size this element declares: the field drew 18px/28.8px
        // while asking for 14px, so it stood 46.8px tall and the paperclip and
        // the end button — pinned to its foot — read 3.4px low (#1583). The
        // paragraph inherits the field's own type instead, which keeps one line
        // on the height the row is built on and lets a new line cost exactly one
        // line box.
        class: cn(
          'tiptap outline-none wrap-anywhere whitespace-pre-wrap [&_p]:[font:inherit]',
          compact ? 'min-h-8 text-sm' : 'min-h-11 max-h-32 overflow-y-auto',
          className,
          // The smiley is pinned inside the field at its start edge, so the text
          // needs the gutter on that side or a long line runs under it.
          offersEmoji ? 'pr-10' : ''
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

  // The bubble follows the selection, measured against the field rather than
  // the viewport: the panel it opens in is a dialog whose `contain-layout` makes
  // it the containing block for anything `fixed`, so a viewport coordinate was
  // read as a panel coordinate and landed below the panel's edge on a desktop.
  useEffect(() => {
    if (!editor) return;

    const place = () => {
      const root = rootRef.current;
      const selection = window.getSelection();
      if (!root || !selection || selection.isCollapsed || selection.rangeCount === 0) {
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
      const box = root.getBoundingClientRect();
      setBubble({
        top: rect.top - box.top - 46,
        left: rect.left - box.left + rect.width / 2,
      });
    };

    document.addEventListener('selectionchange', place);
    return () => document.removeEventListener('selectionchange', place);
  }, [editor]);

  /**
   * The first placement runs before the bubble has ever been drawn, so its width
   * is not known yet. One layout pass puts it back inside the field: the panel
   * clips at its own edge, and a bubble centred on a word near that edge would
   * otherwise be drawn half outside it.
   */
  useLayoutEffect(() => {
    const root = rootRef.current;
    const element = bubbleRef.current;
    if (!root || !element || !bubble) return;
    const half = element.offsetWidth / 2;
    const min = half + 4;
    const max = Math.max(min, root.clientWidth - half - 4);
    const left = Math.min(Math.max(bubble.left, min), max);
    if (left !== bubble.left) setBubble({ ...bubble, left });
  }, [bubble]);

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

  /**
   * A picked glyph goes in at the caret, and the tray stays open so three
   * hearts are three taps. The command runs on the editor's own selection: the
   * press moved the DOM focus into the tray, not the field's place in the text,
   * which ProseMirror keeps across the blur.
   *
   * It reads the editor through the ref because the composer reaches it after
   * the early return that draws the placeholder box.
   */
  const insertEmoji = useCallback((glyph: string) => {
    editorRef.current?.chain().insertContent(glyph).run();
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      insertEmoji,
      focus: () => {
        editorRef.current?.chain().focus().run();
      },
    }),
    [insertEmoji]
  );

  if (!editor) {
    return (
      <div
        className={cn('animate-pulse rounded-xl bg-muted/30', compact ? 'h-8' : 'h-11', className)}
        aria-hidden="true"
      />
    );
  }

  return (
    <div ref={rootRef} className="relative w-full" onFocusCapture={onFocus}>
      <EditorContent editor={editor} />

      {offersEmoji && labels.emoji ? (
        <button
          type="button"
          // The tray's outside-press dismisser leaves this press alone: it is
          // the switch, and closing here would reopen it on the same tap.
          data-emoji-toggle=""
          aria-label={emojiOpen ? labels.emoji.keyboard : labels.emoji.open}
          aria-expanded={emojiOpen}
          // The press that opens the tray is also the moment the chunk is worth
          // fetching, so the panel is already there by the time it draws.
          onPointerEnter={prefetchEmojiPicker}
          onFocus={prefetchEmojiPicker}
          onClick={() => {
            const next = !emojiOpen;
            onEmojiOpenChange?.(next);
            // Closing is the keyboard switch: the caret goes back to the field
            // and a phone raises the alphabet keyboard over it.
            if (!next) editor.chain().focus().run();
          }}
          className="absolute right-1 bottom-1.5 inline-flex size-8 items-center justify-center rounded-full text-muted-foreground transition-safe hover:bg-muted/60 hover:text-foreground"
        >
          {emojiOpen ? (
            <Keyboard size={16} aria-hidden="true" />
          ) : (
            <Smile size={16} aria-hidden="true" />
          )}
        </button>
      ) : null}

      {bubble && !disabled ? (
        <div
          ref={bubbleRef}
          role="toolbar"
          aria-label={labels.toolbar}
          // Above the selection, centred on it, in the field's own coordinates.
          // It is a sibling of the editor rather than a child, so the field's
          // scroll box cannot clip it.
          style={{ top: bubble.top, left: bubble.left }}
          className="absolute z-50 flex -translate-x-1/2 items-center gap-0.5 rounded-full border border-border/70 bg-popover px-1 py-0.5 shadow-lg"
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
});

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
