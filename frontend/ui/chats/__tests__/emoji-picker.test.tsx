import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';

vi.mock('sonner', () => ({ toast: { info: vi.fn(), error: vi.fn() } }));

import { Popover } from '@/frontend/ui/primitives/popover';
import { EmojiPickerPanel, EMOJI_RECENT_STORAGE_KEY } from '@/frontend/ui/chats/emoji-picker';
import { searchEmoji } from '@/frontend/ui/chats/emoji-catalog';

const LABELS = {
  open: 'إضافة إيموجي',
  search: 'ابحث عن إيموجي',
  noResults: 'لا نتائج',
  recent: 'الأخيرة',
  categories: {
    smileys: 'الوجوه',
    gestures: 'الإيماءات',
    hearts: 'القلوب',
    animals: 'الحيوانات',
    food: 'الطعام',
    activity: 'الأنشطة',
    travel: 'السفر',
    objects: 'الأشياء',
    symbols: 'الرموز',
  },
};

function open(onPick = vi.fn()) {
  render(
    <Popover open>
      <EmojiPickerPanel labels={LABELS} onPick={onPick} />
    </Popover>
  );
  return onPick;
}

/**
 * The sheet exists because the third-party pickers search English names only:
 * a member typing «قلب» has to find the hearts, and one typing "heart" has to
 * find the same ones. What is tested here is that promise and the pick's effect,
 * not the layout of the grid.
 */
describe('EmojiPickerPanel', () => {
  it('opens on the faces, with a tab per category', () => {
    open();

    expect(screen.getByRole('tab', { name: LABELS.categories.smileys })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('tab', { name: LABELS.categories.hearts })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'ابتسامة سعيد ضحك' })).toBeInTheDocument();
  });

  it('finds an emoji by its Arabic name', () => {
    open();

    fireEvent.change(screen.getByRole('searchbox', { name: LABELS.search }), {
      target: { value: 'بيتزا' },
    });

    expect(screen.getByRole('button', { name: 'بيتزا' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'ابتسامة سعيد ضحك' })).not.toBeInTheDocument();
  });

  it('finds the same emoji by its English name', () => {
    open();

    fireEvent.change(screen.getByRole('searchbox', { name: LABELS.search }), {
      target: { value: 'heart' },
    });

    // The red heart's Arabic name is the button's accessible name.
    expect(screen.getByRole('button', { name: 'قلب أحمر حب' })).toBeInTheDocument();
  });

  it('says so when a search finds nothing', () => {
    open();

    fireEvent.change(screen.getByRole('searchbox', { name: LABELS.search }), {
      target: { value: 'قققق' },
    });

    expect(screen.getByText(LABELS.noResults)).toBeInTheDocument();
  });

  it('gives the glyph to the field and remembers it for the next open', () => {
    const onPick = open();

    fireEvent.change(screen.getByRole('searchbox', { name: LABELS.search }), {
      target: { value: 'بيتزا' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'بيتزا' }));

    expect(onPick).toHaveBeenCalledWith('🍕');
    expect(JSON.parse(window.localStorage.getItem(EMOJI_RECENT_STORAGE_KEY) ?? '[]')).toEqual([
      '🍕',
    ]);
  });

  it('opens a returning member on the glyphs they used last', async () => {
    window.localStorage.setItem(EMOJI_RECENT_STORAGE_KEY, JSON.stringify(['🍕']));

    await act(async () => {
      open();
    });

    expect(screen.getByRole('tab', { name: LABELS.recent })).toHaveAttribute(
      'aria-selected',
      'true'
    );
    expect(screen.getByRole('button', { name: 'بيتزا' })).toBeInTheDocument();
  });
});

describe('searchEmoji', () => {
  it('matches a prefix in either language and ignores the spelling of Arabic', () => {
    expect(searchEmoji('قل')).toEqual(expect.arrayContaining([expect.arrayContaining(['❤️'])]));
    expect(searchEmoji('HEART')).toEqual(expect.arrayContaining([expect.arrayContaining(['❤️'])]));
    // «قهوه» and «قهوة» are the same word to a searcher.
    expect(searchEmoji('قهوه')).toEqual(expect.arrayContaining([expect.arrayContaining(['☕'])]));
  });

  it('needs every word typed, in any order', () => {
    expect(searchEmoji('قلب مكسور')).toEqual(
      expect.arrayContaining([expect.arrayContaining(['💔'])])
    );
    expect(searchEmoji('قلب طائرة')).toEqual([]);
  });

  it('answers nothing before a word is typed', () => {
    expect(searchEmoji('   ')).toEqual([]);
  });
});
