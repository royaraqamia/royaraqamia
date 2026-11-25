import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { KeyboardSection } from '../keyboard-section';

/** The bridge Android injects into the WebView, with its answers under the test's control. */
function installBridge({ enabled = false, isDefault = false } = {}) {
  const bridge = {
    available: vi.fn(() => true),
    enabled: vi.fn(() => enabled),
    isDefault: vi.fn(() => isDefault),
    openSettings: vi.fn(),
    openPicker: vi.fn(),
  };
  vi.stubGlobal('RoyShellKeyboard', bridge);
  return bridge;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('KeyboardSection', () => {
  it('draws nothing without the native bridge', () => {
    render(<KeyboardSection />);
    expect(screen.queryByText('تفعيل لوحة مفاتيح رؤية رقمية')).not.toBeInTheDocument();
    expect(screen.queryByText('لوحة المفاتيح مفعّلة')).not.toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('draws nothing when the shell cannot run the IME', () => {
    installBridge();
    vi.stubGlobal('RoyShellKeyboard', {
      available: vi.fn(() => false),
      enabled: vi.fn(() => false),
      isDefault: vi.fn(() => false),
      openSettings: vi.fn(),
      openPicker: vi.fn(),
    });

    render(<KeyboardSection />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('asks for settings when the IME is not enabled', () => {
    const bridge = installBridge({ enabled: false });
    render(<KeyboardSection />);

    fireEvent.click(screen.getByRole('button', { name: /تفعيل لوحة مفاتيح رؤية رقمية/ }));
    expect(bridge.openSettings).toHaveBeenCalledTimes(1);
    expect(bridge.openPicker).not.toHaveBeenCalled();
    expect(screen.getByText(/يقوم أندرويد بالتبديل داخل إعداداته الخاصة/)).toBeInTheDocument();
  });

  it('opens the picker when the IME is enabled but not the default', () => {
    const bridge = installBridge({ enabled: true, isDefault: false });
    render(<KeyboardSection />);

    fireEvent.click(screen.getByRole('button', { name: /تعيين لوحة المفاتيح افتراضية/ }));
    expect(bridge.openPicker).toHaveBeenCalledTimes(1);
    expect(bridge.openSettings).not.toHaveBeenCalled();
  });

  it('shows the active row and opens the same picker from «تغيير»', () => {
    const bridge = installBridge({ enabled: true, isDefault: true });
    render(<KeyboardSection />);

    expect(screen.getByText('لوحة المفاتيح مفعّلة')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /تغيير/ }));
    expect(bridge.openPicker).toHaveBeenCalledTimes(1);
    expect(bridge.openSettings).not.toHaveBeenCalled();
  });

  it('reads the answer again when Android hands focus back to the page', async () => {
    const bridge = installBridge({ enabled: false });
    render(<KeyboardSection />);
    await screen.findByRole('button', { name: /تفعيل لوحة مفاتيح رؤية رقمية/ });

    bridge.enabled.mockReturnValue(true);
    bridge.isDefault.mockReturnValue(true);
    fireEvent.focus(window);

    expect(screen.getByText('لوحة المفاتيح مفعّلة')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /تفعيل لوحة مفاتيح رؤية رقمية/ })
    ).not.toBeInTheDocument();
  });
});
