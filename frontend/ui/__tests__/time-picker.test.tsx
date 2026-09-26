import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import {
  TimePicker,
  getMinuteOptions,
  joinHHmm,
  splitHHmm,
} from '@/frontend/ui/primitives/time-picker';

describe('splitHHmm', () => {
  it('parses a valid 24h HH:mm into 12h parts', () => {
    expect(splitHHmm('00:05')).toEqual({ hour12: '12', minute: '05', period: 'am' });
    expect(splitHHmm('08:00')).toEqual({ hour12: '08', minute: '00', period: 'am' });
    expect(splitHHmm('12:00')).toEqual({ hour12: '12', minute: '00', period: 'pm' });
    expect(splitHHmm('13:45')).toEqual({ hour12: '01', minute: '45', period: 'pm' });
    expect(splitHHmm('21:30')).toEqual({ hour12: '09', minute: '30', period: 'pm' });
  });

  it('returns null for empty or invalid values', () => {
    expect(splitHHmm('')).toBeNull();
    expect(splitHHmm('25:99')).toBeNull();
    expect(splitHHmm('9pm')).toBeNull();
    expect(splitHHmm('7:5')).toBeNull();
  });
});

describe('joinHHmm', () => {
  it('converts 12h parts back to 24h HH:mm', () => {
    expect(joinHHmm('12', '05', 'am')).toBe('00:05');
    expect(joinHHmm('08', '00', 'am')).toBe('08:00');
    expect(joinHHmm('12', '00', 'pm')).toBe('12:00');
    expect(joinHHmm('01', '45', 'pm')).toBe('13:45');
    expect(joinHHmm('09', '30', 'pm')).toBe('21:30');
  });

  it('round-trips through splitHHmm', () => {
    const parts = splitHHmm('18:20');
    expect(parts && joinHHmm(parts.hour12, parts.minute, parts.period)).toBe('18:20');
  });
});

describe('getMinuteOptions', () => {
  it('defaults to every minute', () => {
    const options = getMinuteOptions();
    expect(options).toHaveLength(60);
    expect(options[0]).toBe('00');
    expect(options.at(-1)).toBe('59');
  });

  it('steps minutes and keeps the current value selectable', () => {
    expect(getMinuteOptions(15)).toEqual(['00', '15', '30', '45']);
    expect(getMinuteOptions(15, '07')).toEqual(['00', '07', '15', '30', '45']);
  });

  it('clamps out-of-range steps', () => {
    expect(getMinuteOptions(0)).toHaveLength(60);
    expect(getMinuteOptions(120)).toEqual(['00']);
  });
});

describe('TimePicker', () => {
  afterEach(cleanup);

  it('renders hour, minute and period selectors', () => {
    render(<TimePicker value="" onChange={() => {}} aria-label="وقت التذكير" />);
    expect(screen.getByRole('group', { name: 'وقت التذكير' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'وقت التذكير — الساعة' })).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'وقت التذكير — الدقيقة' })).toBeInTheDocument();
    expect(
      screen.getByRole('combobox', { name: 'وقت التذكير — صباحاً أو مساءً' })
    ).toBeInTheDocument();
  });

  it('renders a clear action only when a time is selected', () => {
    const { rerender } = render(<TimePicker value="" onChange={() => {}} aria-label="الوقت" />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    rerender(<TimePicker value="09:30" onChange={() => {}} aria-label="الوقت" />);
    expect(screen.getByRole('button', { name: 'الوقت — مسح' })).toBeInTheDocument();
  });
});
