import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import type { AthkarCollection, AthkarItem } from '@/shared/contracts/athkar';
import { AthkarReader } from '../athkar-reader';
import { ATHKAR_COUNTS_KEY } from '../count-store';

function item(id: string, repeat: number, text = `ذكر ${id}`): AthkarItem {
  return { id, text, repeat, source: { label: 'صحيح البخاري', ref: '1' } };
}

const COLLECTIONS: Record<'morning' | 'evening', AthkarCollection> = {
  morning: {
    period: 'morning',
    title: 'أذكار الصَّباح',
    items: [item('first', 1), item('second', 3), item('third', 2)],
  },
  evening: {
    period: 'evening',
    title: 'أذكار المساء',
    items: [item('evening-one', 2)],
  },
};

const counter = (index: number) => screen.getByRole('button', { name: `عدّ الذكر ${index}` });

afterEach(() => {
  vi.useRealTimers();
});

describe('AthkarReader', () => {
  it('opens on the morning sitting and keeps the evening one out of the DOM', () => {
    render(<AthkarReader collections={COLLECTIONS} />);

    expect(screen.getByRole('tab', { name: 'أذكار الصَّباح' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByText('ذكر first')).toBeInTheDocument();
    expect(screen.queryByText('ذكر evening-one')).not.toBeInTheDocument();
  });

  it('switches sittings from the tab', () => {
    render(<AthkarReader collections={COLLECTIONS} />);

    fireEvent.click(screen.getByRole('tab', { name: 'أذكار المساء' }));

    expect(screen.getByRole('tab', { name: 'أذكار المساء' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByText('ذكر evening-one')).toBeInTheDocument();
    expect(screen.queryByText('ذكر first')).not.toBeInTheDocument();
  });

  it('moves between sittings with the arrow keys, in reading order for RTL', () => {
    render(<AthkarReader collections={COLLECTIONS} />);

    fireEvent.keyDown(screen.getByRole('tab', { name: 'أذكار الصَّباح' }), { key: 'ArrowLeft' });

    expect(screen.getByRole('tab', { name: 'أذكار المساء' })).toHaveAttribute(
      'aria-selected',
      'true'
    );
  });

  it('counts to the stated number and stops there', () => {
    render(<AthkarReader collections={COLLECTIONS} />);

    const second = counter(2);
    expect(second).toHaveTextContent('0 من 3');

    fireEvent.click(second);
    expect(second).toHaveTextContent('1 من 3');

    fireEvent.click(second);
    fireEvent.click(second);
    fireEvent.click(second);

    expect(second).toHaveTextContent('3 من 3');
    expect(second).toBeDisabled();
  });

  it('undoes a mistap with إعادة', () => {
    render(<AthkarReader collections={COLLECTIONS} />);

    fireEvent.click(counter(3));
    expect(counter(3)).toHaveTextContent('1 من 2');

    fireEvent.click(screen.getByRole('button', { name: 'إعادة عدّ الذكر 3' }));

    expect(counter(3)).toHaveTextContent('0 من 2');
    expect(screen.queryByRole('button', { name: 'إعادة عدّ الذكر 3' })).not.toBeInTheDocument();
  });

  it('remembers the count across a reload', () => {
    const first = render(<AthkarReader collections={COLLECTIONS} />);
    fireEvent.click(counter(2));
    first.unmount();

    render(<AthkarReader collections={COLLECTIONS} />);

    expect(counter(2)).toHaveTextContent('1 من 3');
  });

  it('starts today empty when the device only remembers yesterday', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 28, 9, 0, 0));
    window.localStorage.setItem(
      ATHKAR_COUNTS_KEY,
      JSON.stringify({ day: '2026-10-27', morning: { second: 3 }, evening: {} })
    );

    render(<AthkarReader collections={COLLECTIONS} />);

    expect(counter(2)).toHaveTextContent('0 من 3');
  });

  it('renders the source and only the virtue the narration gives', () => {
    render(
      <AthkarReader
        collections={{
          ...COLLECTIONS,
          morning: {
            period: 'morning',
            title: 'أذكار الصَّباح',
            items: [
              { ...item('with-virtue', 1), virtue: 'من قالها دخل الجنة' },
              item('without-virtue', 1),
            ],
          },
        }}
      />
    );

    expect(screen.getAllByText(/صحيح البخاري 1/)).toHaveLength(2);
    expect(screen.getAllByText('الفضل')).toHaveLength(1);
    expect(screen.getByText('من قالها دخل الجنة')).toBeInTheDocument();
  });
});
