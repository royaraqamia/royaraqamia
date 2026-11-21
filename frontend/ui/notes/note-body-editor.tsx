'use client';

import {
  Fragment,
  useEffect,
  useId,
  useReducer,
  useRef,
  useState,
  type KeyboardEvent,
} from 'react';
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
import { resolveMentionHandles } from '@/frontend/api/usernames';
import { NOTES_EDITOR_COPY } from './notes-editor-copy';

const turndown = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
  linkStyle: 'inlined',
});

/** Where a divider follows a tool in the toolbar, by tool index. */
const TOOL_DIVIDERS_AFTER = new Set([3, 5, 10]);

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
 * Turning a just-finished `@handle` into a link (ADR-0192).
 *
 * The trigger is the space (or the line) after the handle, which is the moment a
 * writer has said "that is the name". URLs need no equivalent: the Link extension
 * autolinks what is typed. A handle is different, because whether it is a link
 * depends on a member existing — the one question an input rule cannot ask.
 *
 * The read is awaited and the document is re-checked when it answers: the writer
 * may have moved on, and a link placed at stale offsets would wrap the wrong
 * words. `converting` is what keeps the transaction this makes from re-entering
 * the same path.
 */
async function linkTrailingMention(editor: Editor, converting: { current: boolean }) {
  if (converting.current) return;

  const { from, empty } = editor.state.selection;
  if (!empty) return;

  const $from = editor.state.doc.resolve(from);
  if (!$from.parent.isTextblock) return;

  const before = $from.parent.textBetween(0, $from.parentOffset, undefined, '\ufffc');
  const match = /(^|[\s(])@([\p{L}\p{N}-]{3,30})\s$/u.exec(before);
  if (!match) return;

  const written = match[2]!;
  const handle = written.toLowerCase();
  const start = $from.start() + before.length - match[0].length + match[1]!.length;
  const end = start + 1 + written.length;
  const linkMark = editor.schema.marks.link;
  if (linkMark && editor.state.doc.rangeHasMark(start, end, linkMark)) return;

  converting.current = true;
  try {
    const resolved = await resolveMentionHandles([handle]);
    if (!resolved.includes(handle)) return;

    // The document may have moved while the answer travelled.
    if (editor.state.doc.textBetween(start, end, ' ') !== `@${written}`) return;
    editor
      .chain()
      .setTextSelection({ from: start, to: end })
      .setLink({ href: `/u/${encodeURIComponent(handle)}`, class: 'mention' })
      .setTextSelection(end + 1)
      .run();
  } finally {
    converting.current = false;
  }
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
  placeholder = NOTES_EDITOR_COPY.newNoteHint,
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

  /** One mention conversion at a time; the chain it runs fires `onUpdate` again. */
  const converting = useRef(false);

  // Which tool is the toolbar's single tab stop. Arrow keys move it so the tools
  // stay reachable without putting a Tab stop between the dialog and the text.
  const [activeTool, setActiveTool] = useState(0);

  const editor = useEditor({
    immediatelyRender: false,
    // The writing surface owns the initial focus of the dialog that mounts it.
    // Tiptap focuses on mount, after Radix's open-autofocus has had its turn, so
    // the first thing a member types reaches the note (#1695). One rule
    // here covers the notes composer, the notes editor and the post composer.
    autofocus: 'end',
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Placeholder.configure({ placeholder }),
    ],
    editorProps: {
      attributes: {
        id: surfaceId,
        'aria-label': ariaLabel,
        // No focus ring on purpose: a text field always matches `:focus-visible`,
        // so a ring here stayed drawn for as long as the note was being typed —
        // the wrapper's border is the only frame this surface needs.
        class: cn(
          // `h-full` makes the whole box the field: without it the editable
          // element stops at its last line and a tap below it lands on nothing,
          // which on a phone is most of the screen.
          //
          // `prose-p:my-1.5` is what makes Enter read as a new line rather than
          // a new block: the stored format is Markdown, so Enter is a paragraph
          // and must stay one (a soft break collapses to a space on the post
          // page, which reads Markdown without `remark-breaks`), but prose's
          // 1.14em either side turned every one of them into a visible gap. The
          // line, the list and the heading keep prose's own spacing.
          'prose prose-sm dark:prose-invert h-full max-w-none w-full rounded-xl max-sm:p-4 sm:p-5 selection:bg-primary/20 focus:outline-none prose-p:my-1.5',
          surfaceClassName
        ),
        dir: 'auto',
      },
    },
    onUpdate: ({ editor: current }) => {
      onChangeRef.current(turndown.turndown(current.getHTML()));
      forceRender();
      void linkTrailingMention(current, converting);
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

  /**
   * APG toolbar keys: one tab stop, Arrow keys move between tools. The row stays
   * horizontal on every width — a phone only moves it under the text (ADR-0109)
   * — so Left/Right walk it and Home/End jump to either end. In an RTL toolbar
   * the two arrows reverse, as they do for every other horizontal control.
   */
  function handleToolbarKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (
      event.key !== 'ArrowLeft' &&
      event.key !== 'ArrowRight' &&
      event.key !== 'Home' &&
      event.key !== 'End'
    ) {
      return;
    }

    const buttons = Array.from(event.currentTarget.querySelectorAll('button'));
    const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (current === -1) return;

    let next: number;
    if (event.key === 'Home') {
      next = 0;
    } else if (event.key === 'End') {
      next = buttons.length - 1;
    } else {
      const rtl = getComputedStyle(event.currentTarget).direction === 'rtl';
      const forward = (event.key === 'ArrowRight') !== rtl;
      next = (current + (forward ? 1 : -1) + buttons.length) % buttons.length;
    }
    event.preventDefault();
    buttons[next]!.focus();
  }

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
    // A phone stacks the tools *under* the text, so the row lands directly above
    // the keyboard and the first lines of the note are never pushed down by a
    // toolbar (ADR-0109). Above `sm` the keyboard is not in play and the tools
    // stay above the text they format. Both steps are variants, never a bare
    // base beside a breakpoint step: the shell does not compile this component,
    // so a surface appended later could otherwise win the property with its own
    // base copy and strip the `sm:` step (ADR-0132).
    <div
      className={cn('flex min-h-0 min-w-0 flex-1 max-sm:flex-col-reverse sm:flex-col', className)}
    >
      <div
        role="toolbar"
        aria-label="تنسيق النَّصّ"
        onKeyDown={handleToolbarKeyDown}
        // One row everywhere: the tools scroll sideways instead of wrapping, so
        // the toolbar never becomes a block of rows over the text. The row owns
        // that scroll — `min-w-0` keeps its widest state from widening the
        // dialogue's grid track, which used to scroll the whole composer
        // sideways instead of the tools.
        //
        // Both steps are variants. The shell does not compile this component, so
        // its bare `.border-t` is shipped by whichever surface does and a sheet
        // appended later can win the property and strip `sm:border-t-0` (ADR-0132).
        className="scrollbar-toolbar flex min-w-0 flex-nowrap items-center gap-0.5 overflow-x-auto max-sm:border-t border-border/50 px-2 py-1.5 sm:border-t-0 sm:border-b"
      >
        {[
          {
            label: 'عريض',
            active: editor.isActive('bold'),
            onClick: () => editor.chain().focus().toggleBold().run(),
            icon: Bold,
          },
          {
            label: 'مائل',
            active: editor.isActive('italic'),
            onClick: () => editor.chain().focus().toggleItalic().run(),
            icon: Italic,
          },
          {
            label: 'تسطير',
            active: editor.isActive('underline'),
            onClick: () => editor.chain().focus().toggleUnderline().run(),
            icon: Underline,
          },
          {
            label: 'يتوسطه خط',
            active: editor.isActive('strike'),
            onClick: () => editor.chain().focus().toggleStrike().run(),
            icon: Strikethrough,
          },
          {
            label: 'عنوان رئيسيّ',
            active: editor.isActive('heading', { level: 1 }),
            onClick: () => editor.chain().focus().toggleHeading({ level: 1 }).run(),
            icon: Heading1,
          },
          {
            label: 'عنوان فرعيّ',
            active: editor.isActive('heading', { level: 2 }),
            onClick: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
            icon: Heading2,
          },
          {
            label: 'قائمة نقطيَّة',
            active: editor.isActive('bulletList'),
            onClick: () => editor.chain().focus().toggleBulletList().run(),
            icon: List,
          },
          {
            label: 'قائمة مرقَّمة',
            active: editor.isActive('orderedList'),
            onClick: () => editor.chain().focus().toggleOrderedList().run(),
            icon: ListOrdered,
          },
          {
            label: 'اقتباس',
            active: editor.isActive('blockquote'),
            onClick: () => editor.chain().focus().toggleBlockquote().run(),
            icon: Quote,
          },
          {
            label: 'كتلة كود',
            active: editor.isActive('codeBlock'),
            onClick: () => editor.chain().focus().toggleCodeBlock().run(),
            icon: Code,
          },
          {
            label: 'رابط',
            active: editor.isActive('link'),
            onClick: () => toggleLink(editor),
            icon: Link2,
          },
          {
            label: 'تراجع',
            onClick: () => editor.chain().focus().undo().run(),
            icon: Undo2,
          },
          {
            label: 'إعادة',
            onClick: () => editor.chain().focus().redo().run(),
            icon: Redo2,
          },
        ].map((tool, index) => (
          <Fragment key={tool.label}>
            <ToolbarButton
              label={tool.label}
              active={tool.active}
              onClick={tool.onClick}
              icon={tool.icon}
              tabIndex={index === activeTool ? 0 : -1}
              onFocus={() => setActiveTool(index)}
            />
            {TOOL_DIVIDERS_AFTER.has(index) ? (
              <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-border/70" />
            ) : null}
          </Fragment>
        ))}
      </div>

      {/* The text owns the scroll, not the dialog: with the tools pinned under it
          the sentence being typed stays in place while the note runs past the
          screen, and the toolbar keeps the spot it has above the keyboard. */}
      <EditorContent
        editor={editor}
        className="min-h-0 flex-1 overflow-y-auto dialog-scrollbar-touch-none"
      />
    </div>
  );
}

interface ToolbarButtonProps {
  label: string;
  icon: typeof Bold;
  onClick: () => void;
  active?: boolean;
  tabIndex: number;
  onFocus: () => void;
}

function ToolbarButton({
  label,
  icon: Icon,
  onClick,
  active,
  tabIndex,
  onFocus,
}: ToolbarButtonProps) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      aria-label={label}
      aria-pressed={active === undefined ? undefined : active}
      tabIndex={tabIndex}
      onFocus={onFocus}
      onClick={onClick}
      className={cn('shrink-0', active && 'bg-primary/10 text-primary')}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}
