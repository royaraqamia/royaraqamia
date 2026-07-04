import { X } from 'lucide-react';
import { Button } from './ui/button';
import { useRef } from 'react';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
  modalRef?: React.RefObject<HTMLDivElement>;
}

export function PrivacyPolicyModal({ isOpen, onClose, modalRef }: PrivacyPolicyModalProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const ref = modalRef || internalRef;
  
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999993] p-4 safe-area-inset overflow-y-auto">
      <div 
        className="fixed inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div className="min-h-[calc(100dvh-2rem)] flex items-center justify-center">
        <div 
          ref={ref}
          className="relative bg-background border rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85dvh] overflow-hidden animate-in fade-in-0 zoom-in-95 duration-200 flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-labelledby="privacy-title"
          tabIndex={-1}
        >
        {/* Header */}
        <div className="border-b bg-gradient-to-r from-purple-500/10 to-violet-500/10 px-6 py-4 shrink-0 flex items-center justify-between">
          <h2 id="privacy-title" className="text-xl font-bold">
            سياسة الخصوصية
          </h2>
          <button
            type="button"
            className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-md hover:bg-accent"
            onClick={onClose}
            aria-label="إغلاق"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4 text-sm">
          <section>
            <h3 className="font-bold text-base mb-2">1. جمع المعلومات</h3>
            <p className="text-muted-foreground leading-relaxed">
              نجمع المعلومات التي تقدمها لنا مباشرة عند إنشاء حساب، مثل الاسم والبريد الإلكتروني. كما نجمع معلومات تلقائية حول استخدامك للمنصة لتحسين خدماتنا.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-base mb-2">2. استخدام المعلومات</h3>
            <p className="text-muted-foreground leading-relaxed">
              نستخدم المعلومات التي نجمعها لتوفير خدماتنا، وتحسين تجربة المستخدم، وإرسال إشعارات مهمة، واتخاذ تدابير أمنية، والامتثال للالتزامات القانونية.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-base mb-2">3. مشاركة المعلومات</h3>
            <p className="text-muted-foreground leading-relaxed">
              لا نشارك معلوماتك الشخصية مع أطراف ثالثة إلا بموافقتك أو كما هو مطلوب قانوناً. قد نشارك المعلومات مع مقدمي الخدمات الذين يساعدوننا في تشغيل المنصة.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-base mb-2">4. أمان البيانات</h3>
            <p className="text-muted-foreground leading-relaxed">
              نحن نأخذ أمان بياناتك بجدية. نستخدم تقنيات تشفير حديثة لحماية معلوماتك ونقوم بمراجعة ممارسات الأمان لدينا بانتظام.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-base mb-2">5. ملفات تعريف الارتباط</h3>
            <p className="text-muted-foreground leading-relaxed">
              نستخدم ملفات تعريف الارتباط لتحسين تجربتك على المنصة. يمكنك إدارة تفضيلات ملفات تعريف الارتباط من خلال إعدادات المتصفح الخاص بك.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-base mb-2">6. حقوقك</h3>
            <p className="text-muted-foreground leading-relaxed">
              لديك الحق في الوصول إلى معلوماتك الشخصية وتصحيحها أو حذفها. يمكنك أيضاً سحب موافقتك على معالجة بياناتك في أي وقت.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-base mb-2">7. التغييرات على سياسة الخصوصية</h3>
            <p className="text-muted-foreground leading-relaxed">
              قد نقوم بتحديث سياسة الخصوصية هذه من وقت لآخر. سنقوم بإبلاغك بأي تغييرات مهمة من خلال المنصة أو البريد الإلكتروني.
            </p>
          </section>

          <section>
            <h3 className="font-bold text-base mb-2">8. الاتصال بنا</h3>
            <p className="text-muted-foreground leading-relaxed">
              إذا كان لديك أي أسئلة حول سياسة الخصوصية هذه، يرجى الاتصال بنا عبر البريد الإلكتروني: contact@royaraqamia.com
            </p>
          </section>
        </div>

        {/* Footer */}
          <div className="px-6 py-4 bg-muted/30 border-t shrink-0">
            <Button
              onClick={onClose}
              className="w-full"
              variant="outline"
            >
              فهمت وقبلت
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
