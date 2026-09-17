import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CollapsibleText } from '../collapsible-text';

const TEXT = 'السَّطر الأوَّل\nالسَّطر الثَّاني\nالسَّطر الثَّالث';

function patchHeights(scrollHeight: number, clientHeight: number) {
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeight,
  });
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get: () => clientHeight,
  });
}

afterEach(() => {
  // Removes only the shadowing accessors defined above; jsdom's own
  // (Element.prototype) implementations become visible again.
  Reflect.deleteProperty(HTMLElement.prototype, 'scrollHeight');
  Reflect.deleteProperty(HTMLElement.prototype, 'clientHeight');
});

describe('CollapsibleText', () => {
  it('preserves newlines in the rendered copy', () => {
    patchHeights(40, 40);
    render(<CollapsibleText>{TEXT}</CollapsibleText>);

    const paragraph = screen.getByText(/السَّطر الأوَّل/);
    expect(paragraph).toHaveClass('whitespace-pre-line');
    expect(paragraph.textContent).toBe(TEXT);
  });

  it('renders no toggle when the copy already fits', () => {
    patchHeights(40, 40);
    render(<CollapsibleText>{TEXT}</CollapsibleText>);

    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('clamps to the requested lines and toggles the overflow', () => {
    patchHeights(60, 40);
    render(<CollapsibleText lines={3}>{TEXT}</CollapsibleText>);

    const paragraph = screen.getByText(/السَّطر الأوَّل/);
    expect(paragraph).toHaveClass('line-clamp-3');

    const toggle = screen.getByRole('button', { name: 'عرض المزيد' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls', paragraph.id);

    fireEvent.click(toggle);

    const collapse = screen.getByRole('button', { name: 'عرض أقل' });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    expect(paragraph).not.toHaveClass('line-clamp-3');

    fireEvent.click(collapse);

    expect(screen.getByRole('button', { name: 'عرض المزيد' })).toHaveAttribute(
      'aria-expanded',
      'false'
    );
    expect(paragraph).toHaveClass('line-clamp-3');
  });

  it('supports custom toggle labels', () => {
    patchHeights(60, 40);
    render(
      <CollapsibleText expandLabel="المزيد" collapseLabel="إخفاء">
        {TEXT}
      </CollapsibleText>
    );

    fireEvent.click(screen.getByRole('button', { name: 'المزيد' }));

    expect(screen.getByRole('button', { name: 'إخفاء' })).toBeInTheDocument();
  });
});
