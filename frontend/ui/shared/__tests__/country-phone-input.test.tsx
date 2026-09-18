import * as React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { CountryPhoneInput } from '../country-phone-input';

function mockMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

/** Controlled harness so blur/draft normalization can be observed end-to-end. */
function Harness({
  initial = '',
  ...rest
}: { initial?: string } & Partial<React.ComponentProps<typeof CountryPhoneInput>>) {
  const [value, setValue] = React.useState(initial);
  return <CountryPhoneInput id="phone" value={value} onChange={setValue} {...rest} />;
}

function getInput() {
  return screen.getByRole('textbox') as HTMLInputElement;
}

function paste(input: HTMLInputElement, text: string) {
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
  fireEvent(input, event);
}

beforeEach(() => {
  mockMatchMedia(false);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CountryPhoneInput', () => {
  it('shows the default country dial and an empty national field', () => {
    render(<Harness />);
    expect(screen.getByText('+963')).toBeInTheDocument();
    expect(getInput().value).toBe('');
  });

  it('composes a canonical international value on change', () => {
    const onChange = vi.fn();
    render(<CountryPhoneInput id="phone" value="+963" onChange={onChange} />);

    fireEvent.change(getInput(), { target: { value: '912 345 678' } });

    expect(onChange).toHaveBeenCalledWith('+963 912 345 678');
  });

  it('converts Arabic-Indic digits', () => {
    const onChange = vi.fn();
    render(<CountryPhoneInput id="phone" value="+963" onChange={onChange} />);

    fireEvent.change(getInput(), { target: { value: '٩١٢' } });

    expect(onChange).toHaveBeenCalledWith('+963 912');
  });

  it('keeps a typed leading zero visible, then normalizes it on blur', () => {
    render(<Harness initial="+963" />);
    const input = getInput();

    fireEvent.change(input, { target: { value: '0912' } });

    // Raw digits stay visible while focused…
    expect(input.value).toBe('0912');

    // …and the trunk prefix is dropped once focus leaves.
    fireEvent.blur(input);
    expect(getInput().value).toBe('912');
  });

  it('inserts a paste at the caret instead of replacing the field', () => {
    render(<Harness initial="+963 123" />);
    const input = getInput();
    input.setSelectionRange(3, 3);

    paste(input, '456');

    expect(getInput().value).toBe('123456');
  });

  it('strips a pasted international prefix for a listed country', () => {
    render(<Harness initial="+963" />);

    paste(getInput(), '+971501234567');

    expect(getInput().value).toBe('501234567');
  });

  it('disables both the country trigger and the number field', () => {
    render(<Harness disabled />);

    expect(getInput()).toBeDisabled();
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
