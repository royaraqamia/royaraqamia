import { checkPasswordStrength } from '../utils/validation';
import { Check } from 'lucide-react';

interface PasswordStrengthMeterProps {
  password: string;
}

export function PasswordStrengthMeter({ password }: PasswordStrengthMeterProps) {
  const strength = checkPasswordStrength(password);

  return (
    <div className="space-y-2">
      {/* Strength bar */}
      <div className="flex gap-1">
        {[0, 1, 2, 3].map((index) => (
          <div
            key={index}
            className={`h-1 flex-1 rounded-full transition-colors ${
              index < strength.score ? strength.color : 'bg-muted'
            }`}
          />
        ))}
      </div>
      
      {/* Strength label */}
      <div className="flex items-center justify-between text-xs">
        <span className={`font-medium ${strength.color.replace('bg-', 'text-')}`}>
          {strength.label}
        </span>
        <span className="text-muted-foreground">القوة</span>
      </div>

      {/* Requirements checklist */}
      <div className="space-y-1 mt-2">
        <div className={`flex items-center gap-2 text-xs ${strength.requirements.length ? 'text-green-500' : 'text-muted-foreground'}`}>
          {strength.requirements.length ? (
            <Check className="h-3 w-3" />
          ) : (
            <div className="h-3 w-3 rounded-full border border-current" />
          )}
          <span>7 أحرف على الأقل</span>
        </div>
        <div className={`flex items-center gap-2 text-xs ${strength.requirements.number ? 'text-green-500' : 'text-muted-foreground'}`}>
          {strength.requirements.number ? (
            <Check className="h-3 w-3" />
          ) : (
            <div className="h-3 w-3 rounded-full border border-current" />
          )}
          <span>رقم واحد على الأقل</span>
        </div>
        <div className={`flex items-center gap-2 text-xs ${strength.requirements.special ? 'text-green-500' : 'text-muted-foreground'}`}>
          {strength.requirements.special ? (
            <Check className="h-3 w-3" />
          ) : (
            <div className="h-3 w-3 rounded-full border border-current" />
          )}
          <span>رمز خاص واحد على الأقل</span>
        </div>
      </div>
    </div>
  );
}
