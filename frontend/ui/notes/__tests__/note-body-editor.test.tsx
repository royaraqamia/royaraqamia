import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, within } from '@testing-library/react';

import { NoteBodyEditor } from '../note-body-editor';

beforeEach(() => {
  // The notes surface is Arabic: the toolbar's Right/Left follow the page's
  // direction, which the app sets on the document element.
  document.documentElement.dir = 'rtl';
});

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('dir');
});

async function renderEditor(): Promise<HTMLElement> {
  render(<NoteBodyEditor initialMarkdown="" onChange={vi.fn()} id="note-body-test" />);
  return waitFor(() => {
    const surface = document.getElementById('note-body-test');
    if (!surface) throw new Error('the editor did not mount');
    return surface;
  });
}

describe('NoteBodyEditor', () => {
  it('owns the initial focus so the first keystrokes reach the note', async () => {
    const surface = await renderEditor();

    await waitFor(() => expect(surface).toHaveFocus());
  });

  it('is one tab stop and moves focus between tools with Arrow keys', async () => {
    await renderEditor();
    const toolbar = await screen.findByRole('toolbar', { name: 'تنسيق النَّصّ' });
    const tools = within(toolbar).getAllByRole('button');

    expect(tools).toHaveLength(13);
    expect(tools.filter((tool) => tool.tabIndex === 0)).toHaveLength(1);
    expect(tools[0]!.tabIndex).toBe(0);

    tools[0]!.focus();
    fireEvent.keyDown(toolbar, { key: 'ArrowLeft' });
    expect(tools[1]).toHaveFocus();
    expect(tools[1]!.tabIndex).toBe(0);
    expect(tools[0]!.tabIndex).toBe(-1);

    fireEvent.keyDown(toolbar, { key: 'End' });
    expect(tools[12]).toHaveFocus();
  });
});
