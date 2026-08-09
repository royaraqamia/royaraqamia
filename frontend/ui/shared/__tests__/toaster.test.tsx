import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, act, cleanup } from '@testing-library/react';
import { toast } from 'sonner';
import { RoyaToaster } from '../toaster';

describe('RoyaToaster', () => {
  afterEach(() => {
    cleanup();
    toast.dismiss();
  });

  it('renders a dark, rtl, top-center toaster with styled toasts', async () => {
    render(<RoyaToaster />);

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
