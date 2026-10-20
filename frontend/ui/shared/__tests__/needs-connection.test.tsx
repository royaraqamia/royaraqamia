import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { NeedsConnection } from '../needs-connection';

describe('NeedsConnection', () => {
  it('names the cause and the surface’s own loss', () => {
    render(<NeedsConnection message="تعذّر تحميل المواعيد." />);

    expect(screen.getByText('يتطلَّب الاتصال بالإنترنت')).toBeInTheDocument();
    expect(screen.getByText('تعذّر تحميل المواعيد.')).toBeInTheDocument();
  });

  it('offers the surface’s retry when it has one', () => {
    const onRetry = vi.fn();
    render(<NeedsConnection message="تعذّر التحميل." onRetry={onRetry} />);

    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('keeps the same title in its inline form, without an empty-state block', () => {
    render(<NeedsConnection variant="inline" message="لم يصل الطَّلب إلى الخادم." />);

    expect(screen.getByRole('status')).toHaveTextContent('يتطلَّب الاتصال بالإنترنت');
    expect(screen.getByRole('status')).toHaveTextContent('لم يصل الطَّلب إلى الخادم.');
    expect(screen.queryByRole('heading')).not.toBeInTheDocument();
  });
});
