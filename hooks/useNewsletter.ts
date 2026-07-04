import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';

interface UseNewsletterReturn {
  email: string;
  status: 'idle' | 'loading' | 'success' | 'error';
  emailError: string;
  handleEmailChange: (value: string) => void;
  handleSubmit: (event: FormEvent<HTMLFormElement>) => Promise<void>;
  resetForm: () => void;
}

export function useNewsletter(): UseNewsletterReturn {
  const [email, setEmail] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'success' | 'error'>('idle');
  const [emailError, setEmailError] = useState('');

  const validateEmail = (email: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  const handleEmailChange = (value: string) => {
    setEmail(value);
    if (emailError) {
      setEmailError('');
    }
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    // Validate email
    if (!validateEmail(email)) {
      setEmailError('يرجى إدخال بريد إلكتروني صحيح');
      return;
    }

    setStatus('loading');

    // Simulate API call
    try {
      await new Promise((resolve, reject) => {
        setTimeout(() => {
          // Simulate random success/failure for demo
          if (Math.random() > 0.1) {
            resolve(true);
          } else {
            reject(new Error('Network error'));
          }
        }, 1500);
      });

      setStatus('success');
      toast.success('تم الاشتراك بنجاح! سنرسل لك أحدث المقالات.', {
        duration: 4000,
        description: 'شكراً لانضمامك إلى مجتمعنا',
      });
      setEmail('');

      // Reset success status after showing for a while
      setTimeout(() => {
        setStatus('idle');
      }, 3000);
    } catch (error) {
      setStatus('error');
      toast.error('حدث خطأ في الاشتراك', {
        description: 'يرجى المحاولة مرة أخرى أو التواصل معنا',
      });

      // Reset error status
      setTimeout(() => {
        setStatus('idle');
      }, 3000);
    }
  };

  const resetForm = () => {
    setEmail('');
    setStatus('idle');
    setEmailError('');
  };

  return {
    email,
    status,
    emailError,
    handleEmailChange,
    handleSubmit,
    resetForm,
  };
}
