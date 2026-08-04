'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import ImageExtension from '@tiptap/extension-image';
import LinkExtension from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { forwardRef, useImperativeHandle, useEffect, useRef, useState, useMemo } from 'react';
import { marked } from 'marked';
import TurndownService from 'turndown';
import {
  Heading1,
  Heading2,
  Heading3,
  List,
  ListOrdered,
  TextQuote,
  Code,
  Minus,
} from 'lucide-react';
import type { Editor } from '@tiptap/core';

const turndown = new TurndownService({
  headingStyle: 'atx',
  hr: '---',
  bulletListMarker: '-',
  codeBlockStyle: 'fenced',
  emDelimiter: '*',
  strongDelimiter: '**',
  linkStyle: 'inlined',
});

export interface TiptapEditorRef {
  getMarkdown: () => string;
  insertImage: (url: string, alt?: string) => void;
  editor: Editor | null;
}

interface TiptapEditorProps {
  initialContent: string;
  onUpdate?: (markdown: string) => void;
  onImageUpload?: (file: File) => void;
  onStateChange?: () => void;
  className?: string;
}

interface SlashCommandItem {
  id: string;
  label: string;
  keywords: string;
  icon: React.ElementType;
  run: (editor: Editor) => void;
}

interface SlashState {
  from: number;
  text: string;
  x: number;
  y: number;
}

const SLASH_COMMANDS: SlashCommandItem[] = [
  {
    id: 'h1',
    label: 'عنوان 1',
    keywords: 'h1 heading1 عنوان',
    icon: Heading1,
    run: (editor) => editor.chain().focus().toggleHeading({ level: 1 }).run(),
  },
  {
    id: 'h2',
    label: 'عنوان 2',
    keywords: 'h2 heading2 عنوان',
    icon: Heading2,
    run: (editor) => editor.chain().focus().toggleHeading({ level: 2 }).run(),
  },
  {
    id: 'h3',
    label: 'عنوان 3',
    keywords: 'h3 heading3 عنوان',
    icon: Heading3,
    run: (editor) => editor.chain().focus().toggleHeading({ level: 3 }).run(),
  },
  {
    id: 'list',
    label: 'قائمة نقطية',
    keywords: 'list bullet قائمة',
    icon: List,
    run: (editor) => editor.chain().focus().toggleBulletList().run(),
  },
  {
    id: 'orderedList',
    label: 'قائمة مرقّمة',
    keywords: 'ordered list numbered قائمة مرقمة',
    icon: ListOrdered,
    run: (editor) => editor.chain().focus().toggleOrderedList().run(),
  },
  {
    id: 'quote',
    label: 'اقتباس',
    keywords: 'quote اقتباس',
    icon: TextQuote,
    run: (editor) => editor.chain().focus().toggleBlockquote().run(),
  },
  {
    id: 'codeBlock',
    label: 'كتلة كود',
    keywords: 'code block كود برمجي',
    icon: Code,
    run: (editor) => editor.chain().focus().toggleCodeBlock().run(),
  },
  {
    id: 'hr',
    label: 'فاصل أفقي',
    keywords: 'hr divider فاصل',
    icon: Minus,
    run: (editor) => editor.chain().focus().setHorizontalRule().run(),
  },
];

const TiptapEditor = forwardRef<TiptapEditorRef, TiptapEditorProps>(
  ({ initialContent, onUpdate, onImageUpload, onStateChange, className }, ref) => {
    const onUpdateRef = useRef(onUpdate);
    onUpdateRef.current = onUpdate;
    const onImageUploadRef = useRef(onImageUpload);
    onImageUploadRef.current = onImageUpload;
    const onStateChangeRef = useRef(onStateChange);
    onStateChangeRef.current = onStateChange;

    const [slash, setSlash] = useState<SlashState | null>(null);
    const [slashIndex, setSlashIndex] = useState(0);
    const slashRef = useRef<SlashState | null>(null);
    slashRef.current = slash;
    const slashIndexRef = useRef(0);
    slashIndexRef.current = slashIndex;

    const filteredCommands = useMemo(() => {
      if (!slash) return SLASH_COMMANDS;
      const q = slash.text.trim().toLowerCase();
      if (!q) return SLASH_COMMANDS;
      return SLASH_COMMANDS.filter(
        (cmd) => cmd.id.includes(q) || cmd.keywords.toLowerCase().includes(q)
      );
    }, [slash]);

    const insertSlashCommand = (cmd: SlashCommandItem) => {
      const ed = editor;
      const active = slashRef.current;
      if (!ed || !active) return;
      const { from } = active;
      const to = ed.state.selection.$from.pos;
      ed.chain().focus().deleteRange({ from, to }).run();
      cmd.run(ed);
      setSlash(null);
      setSlashIndex(0);
    };

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          heading: { levels: [1, 2, 3] },
          link: false,
        }),
        ImageExtension,
        LinkExtension.configure({ openOnClick: false }),
        Placeholder.configure({
          placeholder: 'اكتب المحتوى هنا...',
        }),
        TextAlign.configure({
          types: ['heading', 'paragraph'],
          defaultAlignment: 'right',
        }),
      ],
      editorProps: {
        attributes: {
          class:
            'prose prose-sm dark:prose-invert max-w-none w-full focus:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 rounded-lg min-h-full p-6 selection:bg-primary/20',
          dir: 'auto',
        },
        handleDrop: (_view, event, _slice, moved) => {
          if (!moved && event.dataTransfer?.files?.length) {
            const file = event.dataTransfer.files[0];
            if (file?.type.startsWith('image/')) {
              event.preventDefault();
              onImageUploadRef.current?.(file);
              return true;
            }
          }
          return false;
        },
        handlePaste: (_view, event) => {
          const items = event.clipboardData?.items;
          if (!items) return false;
          for (let i = 0; i < items.length; i++) {
            const item = items[i];
            if (!item) continue;
            if (item.type.startsWith('image/')) {
              event.preventDefault();
              const file = item.getAsFile();
              if (file) onImageUploadRef.current?.(file);
              return true;
            }
          }
          return false;
        },
        handleKeyDown: (_view, event) => {
          const active = slashRef.current;
          if (!active) return false;

          if (event.key === 'ArrowDown') {
            event.preventDefault();
            setSlashIndex((i) => (i + 1) % Math.max(filteredCommands.length, 1));
            return true;
          }
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            setSlashIndex(
              (i) =>
                (i - 1 + Math.max(filteredCommands.length, 1)) %
                Math.max(filteredCommands.length, 1)
            );
            return true;
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            setSlash(null);
            return true;
          }
          if (event.key === 'Enter') {
            if (filteredCommands.length === 0) {
              setSlash(null);
              return false;
            }
            const command =
              filteredCommands[Math.min(slashIndexRef.current, filteredCommands.length - 1)];
            if (!command) {
              return false;
            }
            event.preventDefault();
            insertSlashCommand(command);
            return true;
          }
          return false;
        },
      },
      onUpdate: ({ editor: ed }) => {
        const md = turndown.turndown(ed.getHTML());
        onUpdateRef.current?.(md);
      },
    });

    useEffect(() => {
      if (!editor) return;
      const handler = () => onStateChangeRef.current?.();
      editor.on('selectionUpdate', handler);
      editor.on('update', handler);
      return () => {
        editor.off('selectionUpdate', handler);
        editor.off('update', handler);
      };
    }, [editor]);

    useEffect(() => {
      if (!editor) return;
      const detect = () => {
        const { state } = editor;
        const { selection } = state;
        const $from = selection.$from;
        if (
          selection.empty &&
          ($from.parent.type.name === 'paragraph' || $from.parent.type.name === 'heading')
        ) {
          const textBefore = $from.parent.textBetween(0, $from.parentOffset);
          const match = textBefore.match(/(^|\s)\/(\S*)$/);
          if (match && match[2] !== undefined && match[2].length <= 20) {
            const query = match[2];
            const slashPos = $from.parentOffset - query.length - 1;
            const absStart = $from.start() + slashPos;
            const coords = editor.view.coordsAtPos(absStart);
            setSlash((prev) =>
              prev && prev.from === absStart
                ? prev
                : { from: absStart, text: query, x: coords.left, y: coords.bottom }
            );
            return;
          }
        }
        setSlash((prev) => (prev ? null : prev));
      };
      editor.on('transaction', detect);
      return () => {
        editor.off('transaction', detect);
      };
    }, [editor]);

    useEffect(() => {
      if (!editor || !slash) return;
      const onResize = () => {
        const coords = editor.view.coordsAtPos(slash.from);
        setSlash((prev) => (prev ? { ...prev, x: coords.left, y: coords.bottom } : prev));
      };
      window.addEventListener('resize', onResize);
      return () => window.removeEventListener('resize', onResize);
    }, [editor, slash]);

    useEffect(() => {
      if (!editor) return;
      if (!initialContent) {
        editor.commands.setContent('');
        return;
      }
      (async () => {
        try {
          const html = await marked.parse(initialContent);
          if (typeof html === 'string') {
            editor.commands.setContent(html);
          }
        } catch {
          editor.commands.setContent(`<p>${initialContent}</p>`);
        }
      })();
    }, [editor, initialContent]);

    useImperativeHandle(
      ref,
      () => ({
        getMarkdown: () => turndown.turndown(editor?.getHTML() ?? ''),
        insertImage: (url: string, alt?: string) => {
          editor
            ?.chain()
            .focus()
            .setImage({ src: url, alt: alt ?? '' })
            .run();
        },
        editor,
      }),
      [editor]
    );

    if (!editor) {
      return (
        <div className={`flex flex-col gap-4 p-6 ${className ?? 'flex-1'}`}>
          <div className="h-4 bg-muted/30 rounded-lg animate-pulse w-3/4" />
          <div className="h-4 bg-muted/30 rounded-lg animate-pulse w-1/2" />
          <div className="h-4 bg-muted/30 rounded-lg animate-pulse w-5/6" />
          <div className="h-4 bg-muted/30 rounded-lg animate-pulse w-2/3" />
          <div className="h-4 bg-muted/30 rounded-lg animate-pulse w-3/4" />
          <div className="h-4 bg-muted/30 rounded-lg animate-pulse w-1/3" />
        </div>
      );
    }

    const slashMenuX = Math.min(slash?.x ?? 0, Math.max(window.innerWidth - 240, 8));
    const slashMenuY = Math.min(slash?.y ?? 0, Math.max(window.innerHeight - 280, 8));

    return (
      <div className={className ?? 'flex-1'}>
        <EditorContent
          editor={editor}
          className="h-full [&_.ProseMirror]:h-full [&_.ProseMirror]:overflow-y-auto [&_.ProseMirror]:outline-none"
        />

        {slash && (
          <div
            role="listbox"
            aria-label="قائمة الأوامر"
            className="fixed z-50 w-60 rounded-xl border border-border/50 bg-popover shadow-lg shadow-black/5 backdrop-blur-sm overflow-hidden"
            style={{ left: slashMenuX, top: slashMenuY }}
          >
            {filteredCommands.length === 0 ? (
              <div className="px-3 py-2.5 text-xs text-muted-foreground">لا توجد أوامر مطابقة</div>
            ) : (
              filteredCommands.map((cmd, index) => {
                const Icon = cmd.icon;
                const isSelected = index === slashIndex % filteredCommands.length;
                return (
                  <button
                    key={cmd.id}
                    role="option"
                    aria-selected={isSelected}
                    onMouseEnter={() => setSlashIndex(index)}
                    onClick={() => insertSlashCommand(cmd)}
                    className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-start transition-smooth cursor-pointer ${
                      isSelected
                        ? 'bg-primary/10 text-primary'
                        : 'text-foreground hover:bg-muted/60'
                    }`}
                  >
                    <span className="size-7 rounded-md bg-muted/60 flex items-center justify-center shrink-0">
                      <Icon className="size-3.5" />
                    </span>
                    {cmd.label}
                  </button>
                );
              })
            )}
          </div>
        )}
      </div>
    );
  }
);

TiptapEditor.displayName = 'TiptapEditor';
export default TiptapEditor;
