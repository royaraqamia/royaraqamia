import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';

import { ApiError } from '@/frontend/transport/http';
import { ReadFailureNotice, toReadFailure } from '../read-failure';

describe('ReadFailureNotice', () => {
  it('names the connection when the request never left', () => {
    render(<ReadFailureNotice failure={{ offline: true, message: 'تعذّر تحميل المنشورات.' }} />);

    expect(screen.getByText('يتطلَّب الاتصال بالإنترنت')).toBeInTheDocument();
    expect(screen.getByText('تعذّر تحميل المنشورات.')).toBeInTheDocument();
  });

  it('reports an answered failure as an error rather than a connection problem', () => {
    render(<ReadFailureNotice failure={{ offline: false, message: 'تعذّر تحميل المنشورات.' }} />);

    expect(screen.getByText('لم يكتمل الطَّلب')).toBeInTheDocument();
    expect(screen.queryByText('يتطلَّب الاتصال بالإنترنت')).not.toBeInTheDocument();
  });

  it('offers the retry in both forms', () => {
    const onRetry = vi.fn();
    const failure = { offline: false, message: 'تعذّر التحميل.' };

    const { unmount } = render(<ReadFailureNotice failure={failure} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    unmount();

    render(<ReadFailureNotice failure={failure} onRetry={onRetry} variant="inline" />);
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));

    expect(onRetry).toHaveBeenCalledTimes(2);
  });
});

describe('toReadFailure', () => {
  it('marks a request that never left as offline', () => {
    expect(toReadFailure(new ApiError('تعذّر الاتصال بالخادم.'), 'تعذّر التحميل.')).toEqual({
      offline: true,
      message: 'تعذّر التحميل.',
    });
  });

  it('does not mark an answered failure as offline', () => {
    expect(toReadFailure(new ApiError('فشل الحفظ.', 500), 'تعذّر التحميل.')).toEqual({
      offline: false,
      message: 'تعذّر التحميل.',
    });
  });

  it('treats anything that is not an ApiError as answered', () => {
    expect(toReadFailure(new Error('boom'), 'تعذّر التحميل.')).toEqual({
      offline: false,
      message: 'تعذّر التحميل.',
    });
  });

  it('reads the worker’s synthetic 503 as unreachable when the browser is offline', () => {
    const onLine = vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);

    expect(
      toReadFailure(new ApiError('تعذّر إتمام الطلب. أعد المحاولة.', 503), 'تعذّر التحميل.')
    ).toEqual({ offline: true, message: 'تعذّر التحميل.' });

    onLine.mockRestore();
  });

  it('keeps an answered 503 as a server failure while the browser is online', () => {
    expect(toReadFailure(new ApiError('الخدمة متوقفة مؤقتًا.', 503), 'تعذّر التحميل.')).toEqual({
      offline: false,
      message: 'تعذّر التحميل.',
    });
  });
});
