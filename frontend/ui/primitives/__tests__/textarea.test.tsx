import { describe, expect, it } from 'vitest';
import { fireEvent, render } from '@testing-library/react';

import { Textarea } from '../textarea';

function renderCounter(maxLength = 200, minLength = 10) {
  const view = render(
    <Textarea aria-label="topic" showCount maxLength={maxLength} minLength={minLength} />
  );
  const input = view.getByLabelText('topic') as HTMLTextAreaElement;
  const state = () =>
    view.container.querySelector('[data-count-state]')?.getAttribute('data-count-state');
  return { ...view, input, state };
}

describe('Textarea character counter', () => {
  it('stays idle on a pristine field', () => {
    const { state } = renderCounter();
    expect(state()).toBe('idle');
  });

  it('flags below-minimum once the user is short of the floor', () => {
    const { input, state } = renderCounter();
    fireEvent.change(input, { target: { value: 'abc' } });
    expect(state()).toBe('below-min');
  });

  it('reports met as soon as the floor is reached', () => {
    const { input, state } = renderCounter();
    fireEvent.change(input, { target: { value: 'أ'.repeat(10) } });
    expect(state()).toBe('met');
  });

  it('warns near the maximum', () => {
    const { input, state } = renderCounter(200, 10);
    fireEvent.change(input, { target: { value: 'أ'.repeat(170) } });
    expect(state()).toBe('near-limit');
  });

  it('flags at-limit when the maximum is reached', () => {
    const { input, state } = renderCounter(200, 10);
    fireEvent.change(input, { target: { value: 'أ'.repeat(200) } });
    expect(state()).toBe('at-limit');
  });

  it('never flags below-minimum when no floor is provided', () => {
    const view = render(<Textarea aria-label="note" showCount maxLength={200} />);
    const input = view.getByLabelText('note') as HTMLTextAreaElement;
    fireEvent.change(input, { target: { value: 'ab' } });
    expect(
      view.container.querySelector('[data-count-state]')?.getAttribute('data-count-state')
    ).toBe('idle');
  });
});
