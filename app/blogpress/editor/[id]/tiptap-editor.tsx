'use client';

import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import ImageExtension from '@tiptap/extension-image';
import LinkExtension from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';
import TextAlign from '@tiptap/extension-text-align';
import { forwardRef, useImperativeHandle, useEffect, useRef } from 'react';
import { marked } from 'marked';
import TurndownService from 'turndown';
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

const TiptapEditor = forwardRef<TiptapEditorRef, TiptapEditorProps>(
  ({ initialContent, onUpdate, onImageUpload, onStateChange, className }, ref) => {
    const onUpdateRef = useRef(onUpdate);
    onUpdateRef.current = onUpdate;
    const onImageUploadRef = useRef(onImageUpload);
    onImageUploadRef.current = onImageUpload;
    const onStateChangeRef = useRef(onStateChange);
    onStateChangeRef.current = onStateChange;

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
            'prose prose-sm dark:prose-invert max-w-none w-full focus:outline-none min-h-full p-6 selection:bg-primary/20',
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

    if (!editor) return null;

    return (
      <div className={className ?? 'flex-1'}>
        <EditorContent
          editor={editor}
          className="h-full [&_.tiptap-ProseMirror]:h-full [&_.tiptap-ProseMirror]:overflow-y-auto [&_.tiptap-ProseMirror]:outline-none"
        />
      </div>
    );
  }
);

TiptapEditor.displayName = 'TiptapEditor';
export default TiptapEditor;
