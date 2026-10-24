import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';

import type { NavLink } from '../navbar/NavDropdown';
import { SERVICES_ORDER_KEY } from '../navbar/services-order';
import { ServicesMenuItems } from '../navbar/ServicesMenuItems';

const ITEMS: NavLink[] = [
  { href: '/request-project', label: 'طلب بناء مشروع', isRoute: true },
  { href: '/hire', label: 'طلب التَّعاقُد الشَّهري', isRoute: true },
  { href: '/certificates', label: 'التَّحقُّق من الشَّهادة', isRoute: true },
  { href: '/quran', label: 'القرآن الكريم', isRoute: true },
];

function renderItems(subItems: NavLink[] = ITEMS) {
  const onSelect = vi.fn();
  render(<ServicesMenuItems subItems={subItems} onSelect={onSelect} handleHashClick={vi.fn()} />);
  return { onSelect };
}

const labels = () =>
  screen
    .getAllByRole('menuitem')
    .map((row) => row.textContent?.trim())
    .filter((label): label is string => Boolean(label));

const grip = (label: string) =>
  screen.getByRole('button', { name: `اسحب «${label}» لتغيير التَّرتيب` });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ServicesMenuItems order', () => {
  it('ships the default order when the device remembers nothing', () => {
    renderItems();
    expect(labels()).toEqual(ITEMS.map((item) => item.label));
  });

  it('renders the order the device remembers', () => {
    window.localStorage.setItem(
      SERVICES_ORDER_KEY,
      JSON.stringify(['/quran', '/request-project', '/certificates', '/hire'])
    );

    renderItems();

    expect(labels()).toEqual([
      'القرآن الكريم',
      'طلب بناء مشروع',
      'التَّحقُّق من الشَّهادة',
      'طلب التَّعاقُد الشَّهري',
    ]);
  });

  it('leaves a saved href the menu no longer ships out of the list', () => {
    window.localStorage.setItem(SERVICES_ORDER_KEY, JSON.stringify(['/gone', '/hire']));

    renderItems();

    expect(labels()).toEqual([
      'طلب التَّعاقُد الشَّهري',
      'طلب بناء مشروع',
      'التَّحقُّق من الشَّهادة',
      'القرآن الكريم',
    ]);
  });
});

describe('ServicesMenuItems reordering', () => {
  it('moves a row down with the arrow key on its grip, and saves it', () => {
    renderItems();

    fireEvent.keyDown(grip('طلب بناء مشروع'), { key: 'ArrowDown' });

    expect(labels().slice(0, 2)).toEqual(['طلب التَّعاقُد الشَّهري', 'طلب بناء مشروع']);
    expect(JSON.parse(window.localStorage.getItem(SERVICES_ORDER_KEY) ?? '[]')).toEqual([
      '/hire',
      '/request-project',
      '/certificates',
      '/quran',
    ]);
  });

  it('moves a row up and refuses to leave the ends', () => {
    renderItems();

    fireEvent.keyDown(grip('طلب بناء مشروع'), { key: 'ArrowUp' });
    expect(labels()[0]).toBe('طلب بناء مشروع');

    fireEvent.keyDown(grip('القرآن الكريم'), { key: 'ArrowUp' });
    expect(labels()[2]).toBe('القرآن الكريم');
  });

  it('jumps to the ends with Home and End', () => {
    renderItems();

    fireEvent.keyDown(grip('التَّحقُّق من الشَّهادة'), { key: 'Home' });
    expect(labels()[0]).toBe('التَّحقُّق من الشَّهادة');

    fireEvent.keyDown(grip('التَّحقُّق من الشَّهادة'), { key: 'End' });
    expect(labels()[3]).toBe('التَّحقُّق من الشَّهادة');
  });

  it('says where the row went', () => {
    renderItems();

    fireEvent.keyDown(grip('طلب بناء مشروع'), { key: 'ArrowDown' });

    expect(screen.getByRole('status')).toHaveTextContent(
      'نُقِل «طلب بناء مشروع» إلى الموضع 2 من 4.'
    );
  });

  it('still lets a tap on the row follow its link', () => {
    const { onSelect } = renderItems([
      { href: '#projects', label: 'المشاريع', isRoute: false },
      ...ITEMS,
    ]);

    fireEvent.click(screen.getByRole('menuitem', { name: /المشاريع/ }));

    expect(onSelect).toHaveBeenCalled();
  });
});
