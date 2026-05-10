import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { createClient } from '@supabase/supabase-js';
import { Button } from './ui/button';
import { LogIn, LogOut, X, Eye, EyeOff, RefreshCw, Check, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { validateEmail, validatePassword, validateConfirmPassword } from '../utils/validation';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';
import { TermsModal } from './TermsModal';
import { PrivacyPolicyModal } from './PrivacyPolicyModal';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export function AuthButton() {
  const [user, setUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAuth, setShowAuth] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [showTerms, setShowTerms] = useState(false);
  const [showPrivacy, setShowPrivacy] = useState(false);
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  
  // Validation states
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [confirmPasswordError, setConfirmPasswordError] = useState('');
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [confirmPasswordTouched, setConfirmPasswordTouched] = useState(false);
  
  const modalRef = useRef<HTMLDivElement>(null);
  const forgotPasswordRef = useRef<HTMLDivElement>(null);
  const termsRef = useRef<HTMLDivElement>(null);
  const privacyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Check initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  // Focus trap for auth modal
  useEffect(() => {
    if (showAuth && modalRef.current) {
      const focusableElements = modalRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      const handleTab = (e: KeyboardEvent) => {
        if (e.key === 'Tab') {
          if (e.shiftKey) {
            if (document.activeElement === firstElement) {
              lastElement.focus();
              e.preventDefault();
            }
          } else {
            if (document.activeElement === lastElement) {
              firstElement.focus();
              e.preventDefault();
            }
          }
        }
      };

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setShowAuth(false);
        }
      };

      document.addEventListener('keydown', handleTab);
      document.addEventListener('keydown', handleEscape);
      firstElement?.focus();

      return () => {
        document.removeEventListener('keydown', handleTab);
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [showAuth]);

  // Focus trap for forgot password modal
  useEffect(() => {
    if (showForgotPassword && forgotPasswordRef.current) {
      const focusableElements = forgotPasswordRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      const handleTab = (e: KeyboardEvent) => {
        if (e.key === 'Tab') {
          if (e.shiftKey) {
            if (document.activeElement === firstElement) {
              lastElement.focus();
              e.preventDefault();
            }
          } else {
            if (document.activeElement === lastElement) {
              firstElement.focus();
              e.preventDefault();
            }
          }
        }
      };

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setShowForgotPassword(false);
        }
      };

      document.addEventListener('keydown', handleTab);
      document.addEventListener('keydown', handleEscape);
      firstElement?.focus();

      return () => {
        document.removeEventListener('keydown', handleTab);
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [showForgotPassword]);

  // Focus trap for terms modal
  useEffect(() => {
    if (showTerms && termsRef.current) {
      const focusableElements = termsRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      const handleTab = (e: KeyboardEvent) => {
        if (e.key === 'Tab') {
          if (e.shiftKey) {
            if (document.activeElement === firstElement) {
              lastElement.focus();
              e.preventDefault();
            }
          } else {
            if (document.activeElement === lastElement) {
              firstElement.focus();
              e.preventDefault();
            }
          }
        }
      };

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setShowTerms(false);
        }
      };

      document.addEventListener('keydown', handleTab);
      document.addEventListener('keydown', handleEscape);
      firstElement?.focus();

      return () => {
        document.removeEventListener('keydown', handleTab);
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [showTerms]);

  // Focus trap for privacy policy modal
  useEffect(() => {
    if (showPrivacy && privacyRef.current) {
      const focusableElements = privacyRef.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0] as HTMLElement;
      const lastElement = focusableElements[focusableElements.length - 1] as HTMLElement;

      const handleTab = (e: KeyboardEvent) => {
        if (e.key === 'Tab') {
          if (e.shiftKey) {
            if (document.activeElement === firstElement) {
              lastElement.focus();
              e.preventDefault();
            }
          } else {
            if (document.activeElement === lastElement) {
              firstElement.focus();
              e.preventDefault();
            }
          }
        }
      };

      const handleEscape = (e: KeyboardEvent) => {
        if (e.key === 'Escape') {
          setShowPrivacy(false);
        }
      };

      document.addEventListener('keydown', handleTab);
      document.addEventListener('keydown', handleEscape);
      firstElement?.focus();

      return () => {
        document.removeEventListener('keydown', handleTab);
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [showPrivacy]);

  // Real-time validation
  useEffect(() => {
    if (emailTouched) {
      const result = validateEmail(email);
      setEmailError(result.error || '');
    }
  }, [email, emailTouched]);

  useEffect(() => {
    if (passwordTouched) {
      const result = validatePassword(password, isSignUp);
      setPasswordError(result.error || '');
    }
  }, [password, passwordTouched, isSignUp]);

  useEffect(() => {
    if (confirmPasswordTouched && isSignUp) {
      const result = validateConfirmPassword(password, confirmPassword);
      setConfirmPasswordError(result.error || '');
    }
  }, [confirmPassword, confirmPasswordTouched, password, isSignUp]);

  // Reset form when switching modes
  const handleModeSwitch = (newMode: boolean) => {
    setIsSignUp(newMode);
    setEmail('');
    setPassword('');
    setConfirmPassword('');
    setAcceptTerms(false);
    setEmailError('');
    setPasswordError('');
    setConfirmPasswordError('');
    setEmailTouched(false);
    setPasswordTouched(false);
    setConfirmPasswordTouched(false);
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate all fields
    const emailResult = validateEmail(email);
    const passwordResult = validatePassword(password, false);
    
    setEmailError(emailResult.error || '');
    setPasswordError(passwordResult.error || '');
    
    if (!emailResult.isValid || !passwordResult.isValid) {
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        setUser(data.user);
        toast.success('تم تسجيل الدخول بنجاح');
        setShowAuth(false);
        setEmail('');
        setPassword('');
        setEmailError('');
        setPasswordError('');
        setEmailTouched(false);
        setPasswordTouched(false);
      }
    } catch (error: any) {
      console.error('Sign in error:', error);
      toast.error(error.message || 'فشل تسجيل الدخول');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate all fields
    const emailResult = validateEmail(email);
    const passwordResult = validatePassword(password, true);
    const confirmPasswordResult = validateConfirmPassword(password, confirmPassword);
    
    setEmailError(emailResult.error || '');
    setPasswordError(passwordResult.error || '');
    setConfirmPasswordError(confirmPasswordResult.error || '');
    
    if (!emailResult.isValid || !passwordResult.isValid || !confirmPasswordResult.isValid) {
      return;
    }
    
    if (!acceptTerms) {
      toast.error('يرجى قبول الشروط والأحكام');
      return;
    }

    setIsSubmitting(true);
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      if (data.user) {
        setUser(data.user);
        toast.success('تم إنشاء الحساب بنجاح');
        setShowAuth(false);
        setEmail('');
        setPassword('');
        setConfirmPassword('');
        setAcceptTerms(false);
        setEmailError('');
        setPasswordError('');
        setConfirmPasswordError('');
        setEmailTouched(false);
        setPasswordTouched(false);
        setConfirmPasswordTouched(false);
      } else {
        toast.success('تم إنشاء الحساب بنجاح. يرجى التحقق من بريدك الإلكتروني');
      }
    } catch (error: any) {
      console.error('Sign up error:', error);
      toast.error(error.message || 'فشل إنشاء الحساب');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      toast.success('Signed out successfully');
    } catch (error: any) {
      toast.error(error.message || 'Failed to sign out');
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const emailResult = validateEmail(email);
    if (!emailResult.isValid) {
      toast.error(emailResult.error || 'يرجى إدخال بريد إلكتروني صحيح');
      return;
    }

    setIsSubmitting(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/auth/reset-password`,
      });

      if (error) throw error;

      toast.success('تم إرسال رابط إعادة تعيين كلمة المرور إلى بريدك الإلكتروني');
      setShowForgotPassword(false);
      setEmail('');
    } catch (error: any) {
      console.error('Forgot password error:', error);
      toast.error(error.message || 'فشل إرسال رابط إعادة التعيين');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return null;
  }

  if (user) {
    return (
      <Button variant="outline" size="sm" onClick={handleSignOut}>
        <LogOut className="h-4 w-4 mr-2" />
        تسجيل الخروج
      </Button>
    );
  }

  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setShowAuth(true)} className="hidden">
        <LogIn className="h-4 w-4 mr-2" />
        تسجيل الدخول
      </Button>

      {showAuth && createPortal(
        <div className="fixed inset-0 z-[999990] p-4 safe-area-inset overflow-y-auto">
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowAuth(false)}
            aria-hidden="true"
          />
          <div className="min-h-[calc(100dvh-2rem)] flex items-center justify-center">
            <div 
              ref={modalRef}
              className="relative bg-background border rounded-2xl shadow-2xl w-full max-w-md max-h-[85dvh] overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200 flex flex-col"
              role="dialog"
              aria-modal="true"
              aria-labelledby="auth-title"
              tabIndex={-1}
            >
            {/* Header */}
            <div className="border-b bg-gradient-to-r from-purple-500/10 to-violet-500/10 px-6 py-4 shrink-0">
              <h2 id="auth-title" className="text-xl font-bold text-center">
                {isSignUp ? 'إنشاء حساب جديد' : 'مرحباً بعودتك'}
              </h2>
              <p className="text-sm text-muted-foreground text-center mt-1">
                {isSignUp 
                  ? 'انضم إلينا للوصول إلى جميع المميزات' 
                  : 'سجل الدخول للمتابعة'}
                </p>
            </div>

            {/* Toggle Tabs */}
            <div className="flex border-b shrink-0">
              <button
                type="button"
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  !isSignUp 
                    ? 'text-foreground border-b-2 border-purple-500 bg-purple-500/5' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => handleModeSwitch(false)}
                aria-selected={!isSignUp}
                role="tab"
              >
                تسجيل الدخول
              </button>
              <button
                type="button"
                className={`flex-1 py-3 text-sm font-medium transition-colors ${
                  isSignUp 
                    ? 'text-foreground border-b-2 border-purple-500 bg-purple-500/5' 
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => handleModeSwitch(true)}
                aria-selected={isSignUp}
                role="tab"
              >
                إنشاء حساب
              </button>
            </div>

            {/* Form */}
            <form onSubmit={isSignUp ? handleSignUp : handleSignIn} className="p-6 space-y-4 overflow-y-auto">
              <div className="space-y-2">
                <label htmlFor="email" className="text-sm font-medium">
                  البريد الإلكتروني
                </label>
                <div className="relative">
                  <input
                    id="email"
                    type="email"
                    className={`w-full px-4 py-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all ${
                      emailError ? 'border-destructive focus:ring-destructive/50' : ''
                    } ${
                      emailTouched && !emailError ? 'border-green-500 focus:ring-green-500/50' : ''
                    }`}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onBlur={() => setEmailTouched(true)}
                    placeholder="example@email.com"
                    autoComplete="email"
                    required
                    aria-invalid={!!emailError}
                    aria-describedby={emailError ? 'email-error' : undefined}
                  />
                  {emailTouched && !emailError && (
                    <Check className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-green-500" />
                  )}
                </div>
                {emailError && (
                  <p id="email-error" className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {emailError}
                  </p>
                )}
              </div>
              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium">
                  كلمة المرور
                </label>
                <div className="relative">
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    className={`w-full px-4 py-3 pr-12 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all ${
                      passwordError ? 'border-destructive focus:ring-destructive/50' : ''
                    } ${
                      passwordTouched && !passwordError ? 'border-green-500 focus:ring-green-500/50' : ''
                    }`}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onBlur={() => setPasswordTouched(true)}
                    placeholder="••••••••"
                    autoComplete={isSignUp ? 'new-password' : 'current-password'}
                    required
                    aria-invalid={!!passwordError}
                    aria-describedby={passwordError ? 'password-error' : undefined}
                  />
                  <button
                    type="button"
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-accent"
                    onClick={() => setShowPassword(!showPassword)}
                    aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                  >
                    {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
                {passwordError && (
                  <p id="password-error" className="text-xs text-destructive flex items-center gap-1">
                    <AlertCircle className="h-3 w-3" />
                    {passwordError}
                  </p>
                )}
                {isSignUp && password && !passwordError && (
                  <PasswordStrengthMeter password={password} />
                )}
              </div>
              
              {isSignUp && (
                <div className="space-y-2">
                  <label htmlFor="confirmPassword" className="text-sm font-medium">
                    تأكيد كلمة المرور
                  </label>
                  <div className="relative">
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      className={`w-full px-4 py-3 pr-12 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all ${
                        confirmPasswordError ? 'border-destructive focus:ring-destructive/50' : ''
                      } ${
                        confirmPasswordTouched && !confirmPasswordError ? 'border-green-500 focus:ring-green-500/50' : ''
                      }`}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onBlur={() => setConfirmPasswordTouched(true)}
                      placeholder="••••••••"
                      autoComplete="new-password"
                      required
                      aria-invalid={!!confirmPasswordError}
                      aria-describedby={confirmPasswordError ? 'confirm-password-error' : undefined}
                    />
                    <button
                      type="button"
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors p-1 rounded-md hover:bg-accent"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      aria-label={showConfirmPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    >
                      {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                  {confirmPasswordError && (
                    <p id="confirm-password-error" className="text-xs text-destructive flex items-center gap-1">
                      <AlertCircle className="h-3 w-3" />
                      {confirmPasswordError}
                    </p>
                  )}
                </div>
              )}
              
              {isSignUp && (
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    id="terms"
                    checked={acceptTerms}
                    onChange={(e) => setAcceptTerms(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-border text-primary focus:ring-primary"
                    required
                  />
                  <label htmlFor="terms" className="text-xs text-muted-foreground leading-relaxed">
                    أوافق على{' '}
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={(e) => {
                        e.preventDefault();
                        setShowTerms(true);
                      }}
                    >
                      الشروط والأحكام
                    </button>
                    {' '}
                    و{' '}
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={(e) => {
                        e.preventDefault();
                        setShowPrivacy(true);
                      }}
                    >
                      سياسة الخصوصية
                    </button>
                  </label>
                </div>
              )}
              <Button 
                type="submit" 
                className="w-full h-11 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    جاري المعالجة...
                  </span>
                ) : (
                  isSignUp ? 'إنشاء حساب' : 'تسجيل الدخول'
                )}
              </Button>
            </form>

            {/* Footer */}
            <div className="px-6 py-4 bg-muted/30 border-t text-center space-y-2 shrink-0">
              {!isSignUp && (
                <button
                  type="button"
                  className="text-sm text-primary hover:underline"
                  onClick={() => setShowForgotPassword(true)}
                >
                  نسيت كلمة المرور؟
                </button>
              )}
              <p className="text-sm text-muted-foreground">
                {isSignUp ? 'لديك حساب بالفعل؟' : 'ليس لديك حساب؟'}
                <button
                  type="button"
                  className="text-purple-600 hover:text-purple-700 font-medium mr-1"
                  onClick={() => handleModeSwitch(!isSignUp)}
                >
                  {isSignUp ? 'سجل الدخول' : 'أنشئ حساباً'}
                </button>
              </p>
            </div>

            {/* Close Button */}
            <button
              type="button"
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors p-2 rounded-md hover:bg-accent"
              onClick={() => setShowAuth(false)}
              aria-label="إغلاق"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>,
      document.body
      )}
      
      {/* Forgot Password Modal */}
      {showForgotPassword && createPortal(
        <div className="fixed inset-0 z-[999991] p-4 safe-area-inset overflow-y-auto">
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowForgotPassword(false)}
            aria-hidden="true"
          />
          <div className="min-h-[calc(100dvh-2rem)] flex items-center justify-center">
            <div 
              ref={forgotPasswordRef}
              className="relative bg-background border rounded-2xl shadow-2xl w-full max-w-md max-h-[85dvh] overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200 flex flex-col"
              role="dialog"
              aria-modal="true"
              aria-labelledby="forgot-password-title"
              tabIndex={-1}
            >
            {/* Header */}
            <div className="border-b bg-gradient-to-r from-purple-500/10 to-violet-500/10 px-6 py-4 shrink-0">
              <h2 id="forgot-password-title" className="text-xl font-bold text-center">
                استعادة كلمة المرور
              </h2>
              <p className="text-sm text-muted-foreground text-center mt-1">
                أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة تعيين كلمة المرور
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleForgotPassword} className="p-6 space-y-4 overflow-y-auto">
              <div className="space-y-2">
                <label htmlFor="forgot-email" className="text-sm font-medium">
                  البريد الإلكتروني
                </label>
                <input
                  id="forgot-email"
                  type="email"
                  className="w-full px-4 py-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="example@email.com"
                  autoComplete="email"
                  required
                />
              </div>
              <Button 
                type="submit" 
                className="w-full h-11 bg-gradient-to-r from-purple-600 to-violet-600 hover:from-purple-700 hover:to-violet-700"
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <span className="flex items-center justify-center gap-2">
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    جاري الإرسال...
                  </span>
                ) : (
                  'إرسال رابط إعادة التعيين'
                )}
              </Button>
            </form>

            {/* Footer */}
            <div className="px-6 py-4 bg-muted/30 border-t text-center shrink-0">
              <button
                type="button"
                className="text-sm text-purple-600 hover:text-purple-700 font-medium"
                onClick={() => setShowForgotPassword(false)}
              >
                العودة إلى تسجيل الدخول
              </button>
            </div>

            {/* Close Button */}
            <button
              type="button"
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors p-2 rounded-md hover:bg-accent"
              onClick={() => setShowForgotPassword(false)}
              aria-label="إغلاق"
            >
              <X className="h-5 w-5" />
            </button>
            </div>
          </div>
        </div>,
        document.body
      )}
      
      {/* Terms Modal */}
      {showTerms && createPortal(
        <TermsModal 
          isOpen={showTerms} 
          onClose={() => setShowTerms(false)}
          modalRef={termsRef}
        />,
        document.body
      )}
      
      {/* Privacy Policy Modal */}
      {showPrivacy && createPortal(
        <PrivacyPolicyModal 
          isOpen={showPrivacy} 
          onClose={() => setShowPrivacy(false)}
          modalRef={privacyRef}
        />,
        document.body
      )}
    </>
  );
}
