// Validation utilities for authentication forms

export interface ValidationResult {
  isValid: boolean;
  error?: string;
}

export interface PasswordStrength {
  score: number; // 0-4
  label: string;
  color: string;
  requirements: {
    length: boolean;
    number: boolean;
    special: boolean;
  };
}

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Password requirements
const MIN_PASSWORD_LENGTH = 7;
const PASSWORD_NUMBER_REGEX = /\d/;
const PASSWORD_SPECIAL_REGEX = /[!@#$%^&*(),.?":{}|<>]/;

export function validateEmail(email: string): ValidationResult {
  if (!email) {
    return { isValid: false, error: 'يرجى إدخال البريد الإلكتروني' };
  }
  
  if (!EMAIL_REGEX.test(email)) {
    return { isValid: false, error: 'يرجى إدخال بريد إلكتروني صحيح' };
  }
  
  return { isValid: true };
}

export function validatePassword(password: string, isSignUp: boolean = false): ValidationResult {
  if (!password) {
    return { isValid: false, error: 'يرجى إدخال كلمة المرور' };
  }
  
  if (isSignUp) {
    const errors: string[] = [];
    
    if (password.length < MIN_PASSWORD_LENGTH) {
      errors.push(`${MIN_PASSWORD_LENGTH} أحرف على الأقل`);
    }
    
    if (!PASSWORD_NUMBER_REGEX.test(password)) {
      errors.push('رقم واحد على الأقل');
    }
    
    if (!PASSWORD_SPECIAL_REGEX.test(password)) {
      errors.push('رمز خاص واحد على الأقل');
    }
    
    if (errors.length > 0) {
      return { 
        isValid: false, 
        error: `يجب أن تتضمن كلمة المرور: ${errors.join('، ')}` 
      };
    }
  } else {
    if (password.length < MIN_PASSWORD_LENGTH) {
      return { 
        isValid: false, 
        error: `يجب أن تكون كلمة المرور ${MIN_PASSWORD_LENGTH} أحرف على الأقل` 
      };
    }
  }
  
  return { isValid: true };
}

export function validateConfirmPassword(password: string, confirmPassword: string): ValidationResult {
  if (!confirmPassword) {
    return { isValid: false, error: 'يرجى تأكيد كلمة المرور' };
  }
  
  if (password !== confirmPassword) {
    return { isValid: false, error: 'كلمات المرور غير متطابقة' };
  }
  
  return { isValid: true };
}

export function checkPasswordStrength(password: string): PasswordStrength {
  let score = 0;
  const requirements = {
    length: password.length >= MIN_PASSWORD_LENGTH,
    number: PASSWORD_NUMBER_REGEX.test(password),
    special: PASSWORD_SPECIAL_REGEX.test(password),
  };
  
  // Calculate score
  if (requirements.length) score++;
  if (requirements.number) score++;
  if (requirements.special) score++;
  if (password.length >= 10) score++;
  if (password.length >= 12) score++;
  
  // Cap score at 4
  score = Math.min(score, 4);
  
  // Determine label and color based on score
  const strengthLevels = [
    { label: 'ضعيفة جداً', color: 'bg-red-500' },
    { label: 'ضعيفة', color: 'bg-orange-500' },
    { label: 'متوسطة', color: 'bg-yellow-500' },
    { label: 'قوية', color: 'bg-green-500' },
    { label: 'قوية جداً', color: 'bg-emerald-500' },
  ];
  
  return {
    score,
    label: strengthLevels[score].label,
    color: strengthLevels[score].color,
    requirements,
  };
}
