import { SCAN_COPY } from './scan-copy';
import type { ScanResultKind } from '@/shared/contracts/scan';

/**
 * The Scanner's labels come from the generated copy source, not the classifier's
 * contract table (#1707). The classifier decides *what* a payload is; the words
 * for that decision belong to the two clients' one copy source.
 */
export function scanKindLabel(kind: ScanResultKind): string {
  switch (kind) {
    case 'link':
      return SCAN_COPY.kindLink;
    case 'email':
      return SCAN_COPY.kindEmail;
    case 'phone':
      return SCAN_COPY.kindPhone;
    case 'sms':
      return SCAN_COPY.kindSms;
    case 'wifi':
      return SCAN_COPY.kindWifi;
    case 'contact':
      return SCAN_COPY.kindContact;
    case 'location':
      return SCAN_COPY.kindLocation;
    case 'otp':
      return SCAN_COPY.kindOtp;
    case 'text':
      return SCAN_COPY.kindText;
  }
}

/** The action's words, chosen from the destination's scheme. */
export function scanActionLabel(href: string): string {
  if (href.startsWith('mailto:')) return SCAN_COPY.actionMail;
  if (href.startsWith('tel:')) return SCAN_COPY.actionTel;
  if (href.startsWith('sms:')) return SCAN_COPY.actionSms;
  if (href.startsWith('geo:')) return SCAN_COPY.actionGeo;
  return SCAN_COPY.linkAction;
}
