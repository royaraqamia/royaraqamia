import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';

import { LeadSuccessPanel } from '../lead-success-panel';

describe('LeadSuccessPanel', () => {
  it('shows the reference code so the applicant can quote it', () => {
    render(<LeadSuccessPanel referenceCode="TRN-2026-A7K2M9QX" message="سنتواصل معك." />);

    expect(screen.getByText('TRN-2026-A7K2M9QX')).toBeInTheDocument();
    expect(screen.getByText('رقم الطَّلب')).toBeInTheDocument();
  });

  it('defaults the heading and honours an override', () => {
    const { rerender } = render(<LeadSuccessPanel referenceCode="A" message="m" />);
    expect(screen.getByRole('heading')).toHaveTextContent('تمَّ استلام طلبك بنجاح!');

    rerender(<LeadSuccessPanel referenceCode="A" message="m" title="عنوان مخصَّص" />);
    expect(screen.getByRole('heading')).toHaveTextContent('عنوان مخصَّص');
  });

  it('copies the code to the clipboard and confirms', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });

    render(<LeadSuccessPanel referenceCode="PRJ-2026-ABCDEFGH" message="m" />);

    fireEvent.click(screen.getByRole('button', { name: 'نسخ رقم الطَّلب' }));

    expect(writeText).toHaveBeenCalledWith('PRJ-2026-ABCDEFGH');
    expect(await screen.findByText('تمَّ النَّسخ')).toBeInTheDocument();
  });

  it('sends a signed-in submitter straight to طلباتي', () => {
    render(<LeadSuccessPanel referenceCode="A" message="m" isAuthenticated />);

    expect(screen.getByRole('link', { name: /طلباتي/ })).toHaveAttribute(
      'href',
      '/account/submissions'
    );
  });

  it('tells an anonymous submitter that editing needs an account', () => {
    render(<LeadSuccessPanel referenceCode="A" message="m" />);

    expect(screen.queryByRole('link', { name: /عدِّل طلبك/ })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'طلباتي' })).toHaveAttribute(
      'href',
      '/account/submissions'
    );
  });

  it('offers a fresh start when the receipt is restored', () => {
    const onStartOver = vi.fn();
    render(<LeadSuccessPanel referenceCode="A" message="m" restored onStartOver={onStartOver} />);

    expect(screen.getByText(/استعدنا رقم طلبك/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /إرسال طلب جديد/ }));
    expect(onStartOver).toHaveBeenCalledOnce();
  });
});
