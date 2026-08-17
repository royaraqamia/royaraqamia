import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { toast } from 'sonner';
import { RoyaToaster } from '../toaster';

describe('RoyaToaster', () => {
  afterEach(() => {
    cleanup();
    toast.dismiss();
  });

  it('does not mount until first interaction', () => {
    render(<RoyaToaster />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('lazy-mounts a dark, rtl, top-center toaster after first interaction and shows toasts', async () => {
    render(<RoyaToaster />);

    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
    });

    await screen.findByRole('region', { name: /Notifications/ });

    act(() => {
      toast.success('تمت العملية بنجاح', { description: 'تم حفظ البيانات' });
    });

    const toaster = await screen.findByRole('list');
    expect(toaster).toHaveAttribute('data-sonner-theme', 'dark');
    expect(toaster).toHaveAttribute('data-y-position', 'top');
    expect(toaster).toHaveAttribute('data-x-position', 'center');
    expect(screen.getByText('تمت العملية بنجاح')).toBeInTheDocument();
    expect(screen.getByText('تم حفظ البيانات')).toBeInTheDocument();
    expect(toaster.querySelector('[data-type="success"]')).not.toBeNull();
    expect(toaster.querySelector('[data-close-button="true"]')).not.toBeNull();
  });
});
