import { X } from 'lucide-react';
import { Button } from './ui/button';
import { useRef } from 'react';

interface TermsModalProps {
  isOpen: boolean;
  onClose: () => void;
  modalRef?: React.RefObject<HTMLDivElement>;
}

export function TermsModal({ isOpen, onClose, modalRef }: TermsModalProps) {
  const internalRef = useRef<HTMLDivElement>(null);
  const ref = modalRef || internalRef;

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[999992] p-4 safe-area-inset overflow-y-auto">
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
          aria-labelledby="terms-title"
          tabIndex={-1}
        >
          {/* Header */}
          <div className="border-b bg-gradient-to-r from-purple-500/10 to-violet-500/10 px-6 py-4 shrink-0 flex items-center justify-between">
            <h2 id="terms-title" className="text-xl font-bold">
              الشروط والأحكام
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
              <h3 className="font-bold text-base mb-2">1. مقدمة</h3>
              <p className="text-muted-foreground leading-relaxed">
                مرحباً بك في منصة رؤية رقمية. باستخدامك لهذه المنصة، فإنك توافق على الالتزام بهذه
                الشروط والأحكام. يرجى قراءتها بعناية قبل استخدام المنصة.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-base mb-2">2. قبول الشروط</h3>
              <p className="text-muted-foreground leading-relaxed">
                بالوصول إلى منصة رؤية رقمية أو استخدامها، فإنك توافق على الالتزام بهذه الشروط
                والأحكام وسياسة الخصوصية الخاصة بنا. إذا كنت لا توافق على أي جزء من هذه الشروط، يرجى
                عدم استخدام المنصة.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-base mb-2">3. استخدام المنصة</h3>
              <p className="text-muted-foreground leading-relaxed">
                تمنحك رؤية رقمية ترخيصاً محدوداً وغير حصري وغير قابل للتحويل لاستخدام المنصة للأغراض
                الشخصية وغير التجارية. أنت تقر بأنك لن تستخدم المنصة لأي غرض غير قانوني أو غير مصرح
                به.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-base mb-2">4. الحساب والأمان</h3>
              <p className="text-muted-foreground leading-relaxed">
                أنت مسؤول عن الحفاظ على سرية معلومات حسابك وكلمة المرور الخاصة بك. أنت توافق على
                إبلاغنا فوراً بأي استخدام غير مصرح به لحسابك أو أي خرق آخر للأمان.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-base mb-2">5. الملكية الفكرية</h3>
              <p className="text-muted-foreground leading-relaxed">
                جميع المحتويات والمواد والعلامات التجارية الموجودة على منصة رؤية رقمية هي ملكية
                حصرية لنا أو لموردينا. يمنع نسخ أو توزيع أو إنشاء أعمال مشتقة دون إذن كتابي مسبق.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-base mb-2">6. إخلاء المسؤولية</h3>
              <p className="text-muted-foreground leading-relaxed">
                يتم توفير المحتوى على المنصة &quot;كما هي&quot; دون أي ضمانات من أي نوع.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-base mb-2">7. التعديلات</h3>
              <p className="text-muted-foreground leading-relaxed">
                نحتفظ بالحق في تعديل هذه الشروط والأحكام في أي وقت. سيتم نشر أي تعديلات على هذه
                الصفحة، وتنطبق التعديلات فور نشرها.
              </p>
            </section>

            <section>
              <h3 className="font-bold text-base mb-2">8. الاتصال بنا</h3>
              <p className="text-muted-foreground leading-relaxed">
                إذا كان لديك أي أسئلة حول هذه الشروط والأحكام، يرجى الاتصال بنا عبر البريد
                الإلكتروني: contact@royaraqamia.com
              </p>
            </section>
          </div>

          {/* Footer */}
          <div className="px-6 py-4 bg-muted/30 border-t shrink-0">
            <Button onClick={onClose} className="w-full" variant="outline">
              فهمت وقبلت
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
