/**
 * The inline grammar a chat message is stored in (ADR-0193).
 *
 * A message body is text, and stays text: `shared/contracts/chat.ts` caps it at
 * four thousand characters and the column is a string, so the formatting has to
 * survive as markdown the way a note's does. The difference is the subset — a
 * message has no headings, lists or quotes, only the marks Telegram has trained
 * everyone to expect, and the operators are Telegram's own so a reader who
 * types `__underline__` on their phone and on the site gets the same word:
 *
 *   **bold**   *italic*  _italic_   __underline__   ~~strike~~   `code`
 *   [label](https://…)   and a newline is a line break.
 *
 * One module parses the stored text for the bubble and writes it back from the
 * editor, so the two directions cannot disagree about what a marker means. It is
 * deliberately a parser for *this* subset rather than a Markdown library: the
 * chats surface is loaded on every thread, and `marked` plus `turndown` is
 * weight a message does not need (ADR-0192 priced that lesson at 30 KB).
 */

export type ChatMark = 'bold' | 'italic' | 'underline' | 'strike' | 'code';

export type ChatInline =
  | { kind: 'text'; value: string }
  | { kind: 'break' }
  | { kind: 'mark'; mark: ChatMark; children: ChatInline[] }
  | { kind: 'link'; href: string; children: ChatInline[] };

/** Marker → mark, longest first: `**` must win over `*`, `__` over `_`. */
const MARKERS: Array<{ token: string; mark: ChatMark }> = [
  { token: '**', mark: 'bold' },
  { token: '__', mark: 'underline' },
  { token: '~~', mark: 'strike' },
  { token: '*', mark: 'italic' },
  { token: '_', mark: 'italic' },
];

/** Only these may reach an `href`; the field is typed by hand, not by a browser. */
export function isSafeHref(href: string): boolean {
  return /^(https?:\/\/|\/|#)/i.test(href.trim());
}

function parseRange(input: string): ChatInline[] {
  const nodes: ChatInline[] = [];
  let text = '';
  let index = 0;

  const flush = () => {
    if (text === '') return;
    nodes.push({ kind: 'text', value: text });
    text = '';
  };

  while (index < input.length) {
    const char = input[index]!;

    // A backslash is the writer's way of saying "this marker is text".
    if (char === '\\' && index + 1 < input.length) {
      const next = input[index + 1]!;
      if ('\\`*_~[]'.includes(next)) {
        text += next;
        index += 2;
        continue;
      }
    }

    if (char === '\n') {
      flush();
      nodes.push({ kind: 'break' });
      index += 1;
      continue;
    }

    // A code span is literal: no markers, no links, no breaks inside it.
    if (char === '`') {
      const close = input.indexOf('`', index + 1);
      const inner = close === -1 ? '' : input.slice(index + 1, close);
      if (close !== -1 && inner !== '' && !inner.includes('\n')) {
        flush();
        nodes.push({ kind: 'mark', mark: 'code', children: [{ kind: 'text', value: inner }] });
        index = close + 1;
        continue;
      }
    }

    // A link keeps its label as text; nesting marks inside a label is not
    // something the field produces, and a parser that allowed it would have to
    // know where the label ends before it knows the marks.
    if (char === '[') {
      const close = input.indexOf('](', index + 1);
      if (close !== -1) {
        const end = input.indexOf(')', close + 2);
        const href = end === -1 ? '' : input.slice(close + 2, end);
        if (end !== -1 && isSafeHref(href)) {
          flush();
          nodes.push({
            kind: 'link',
            href: href.trim(),
            children: [{ kind: 'text', value: input.slice(index + 1, close) }],
          });
          index = end + 1;
          continue;
        }
      }
    }

    const marker = MARKERS.find((candidate) => input.startsWith(candidate.token, index));
    if (marker) {
      const from = index + marker.token.length;
      const close = findClosing(input, marker.token, from);
      if (close !== -1) {
        flush();
        nodes.push({
          kind: 'mark',
          mark: marker.mark,
          children: parseRange(input.slice(from, close)),
        });
        index = close + marker.token.length;
        continue;
      }
    }

    text += char;
    index += 1;
  }

  flush();
  return nodes;
}

/**
 * The closing marker, skipping any that lives inside a code span — `` `a*b` `` is
 * code holding a star, not the start of an italic run. A mark may span the lines
 * it was written across: Enter inserts a break *inside* the run that is open, so
 * `**a⏎b**` is one bold sentence over two lines, and refusing it here would show
 * the markers raw.
 */
function findClosing(input: string, token: string, from: number): number {
  let index = from;
  while (index < input.length) {
    const char = input[index]!;
    if (char === '`') {
      const close = input.indexOf('`', index + 1);
      if (close === -1) return -1;
      index = close + 1;
      continue;
    }
    if (input.startsWith(token, index) && index > from) return index;
    index += 1;
  }
  return -1;
}

/** The stored body as inline nodes the bubble can draw. */
export function parseChatMarkdown(text: string): ChatInline[] {
  return parseRange(text);
}

/** The plain words of a body, for a preview that cannot render marks. */
export function chatMarkdownToPlainText(text: string): string {
  const flatten = (nodes: ChatInline[]): string =>
    nodes
      .map((node) => {
        if (node.kind === 'text') return node.value;
        if (node.kind === 'break') return ' ';
        if (node.kind === 'link') return flatten(node.children);
        return flatten(node.children);
      })
      .join('');
  return flatten(parseChatMarkdown(text)).trim();
}

/** A minimal Tiptap/ProseMirror JSON shape, so the field needs no HTML parser. */
export interface ProseMirrorNode {
  type: string;
  text?: string;
  marks?: Array<{ type: string; attrs?: Record<string, string> }>;
  content?: ProseMirrorNode[];
}

const MARK_TO_PROSEMIRROR: Record<ChatMark, string> = {
  bold: 'bold',
  italic: 'italic',
  underline: 'underline',
  strike: 'strike',
  code: 'code',
};

function inlineToNodes(
  nodes: ChatInline[],
  marks: Array<{ type: string }> = []
): ProseMirrorNode[] {
  const content: ProseMirrorNode[] = [];
  for (const node of nodes) {
    if (node.kind === 'text') {
      content.push({ type: 'text', text: node.value, ...(marks.length > 0 ? { marks } : {}) });
      continue;
    }
    if (node.kind === 'break') {
      content.push({ type: 'hardBreak' });
      continue;
    }
    if (node.kind === 'link') {
      content.push(
        ...inlineToNodes(node.children, [
          ...marks,
          { type: 'link', attrs: { href: node.href } } as unknown as { type: string },
        ])
      );
      continue;
    }
    content.push(
      ...inlineToNodes(node.children, [...marks, { type: MARK_TO_PROSEMIRROR[node.mark] }])
    );
  }
  return content;
}

/** Stored text → the document the editor opens with. */
export function chatMarkdownToDoc(text: string): ProseMirrorNode {
  const content = inlineToNodes(parseChatMarkdown(text));
  return {
    type: 'doc',
    content: [{ type: 'paragraph', ...(content.length > 0 ? { content } : {}) }],
  };
}

const MARK_TO_MARKDOWN: Record<string, string> = {
  bold: '**',
  // Underscore for emphasis, never the asterisk: `***x***` is bold inside italic
  // and italic inside bold at once, and no parser this small can tell which the
  // writer meant. `**_x_**` has one reading.
  italic: '_',
  underline: '__',
  strike: '~~',
  code: '`',
};

function escapeText(value: string): string {
  // A body that literally contains a marker must survive the round trip.
  return value.replace(/([\\`*_~[\]])/g, '\\$1');
}

interface OpenMark {
  key: string;
  open: string;
  close: string;
  /** Code text is literal: nothing inside it may be escaped or read as a mark. */
  literal: boolean;
}

const MARK_ORDER = ['link', 'code', 'bold', 'italic', 'underline', 'strike'];

function openMarksOf(node: ProseMirrorNode): OpenMark[] {
  const marks = [...(node.marks ?? [])].sort(
    (a, b) => MARK_ORDER.indexOf(a.type) - MARK_ORDER.indexOf(b.type)
  );

  return marks.map((mark): OpenMark => {
    if (mark.type === 'link') {
      const href = mark.attrs?.href ?? '';
      return { key: `link:${href}`, open: '[', close: `](${href})`, literal: false };
    }
    if (mark.type === 'code') return { key: 'code', open: '`', close: '`', literal: true };
    const token = MARK_TO_MARKDOWN[mark.type] ?? '';
    return { key: mark.type, open: token, close: token, literal: false };
  });
}

/** A paragraph's inline nodes, with each run of marks opened and closed once. */
function paragraphToMarkdown(nodes: ProseMirrorNode[]): string {
  let output = '';
  let open: OpenMark[] = [];

  const closeTo = (depth: number) => {
    for (let index = open.length - 1; index >= depth; index -= 1) {
      output += open[index]?.close ?? '';
    }
    open = open.slice(0, depth);
  };

  for (const node of nodes) {
    if (node.type === 'hardBreak') {
      // A break inside an open run belongs to the run: closing first would put
      // the markers on someone else's line.
      output += '\n';
      continue;
    }
    if (node.type !== 'text' || node.text === undefined) continue;

    const wanted = openMarksOf(node);
    let shared = 0;
    while (
      shared < open.length &&
      shared < wanted.length &&
      open[shared]?.key === wanted[shared]?.key
    ) {
      shared += 1;
    }
    closeTo(shared);

    for (const mark of wanted.slice(shared)) {
      output += mark.open;
      open.push(mark);
    }

    const literal = open.some((mark) => mark.literal);
    output += literal ? node.text : escapeText(node.text);
  }

  closeTo(0);
  return output;
}

/** The editor's document → the text that is stored and rendered. */
export function chatDocToMarkdown(doc: ProseMirrorNode | null | undefined): string {
  if (!doc?.content) return '';
  return doc.content.map((block) => paragraphToMarkdown(block.content ?? [])).join('\n');
}
