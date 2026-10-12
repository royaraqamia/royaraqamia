// The Scanner's vocabulary and the pure logic that turns a decoded payload into
// a **Scan Result** the page can act on safely.
//
// A payload is untrusted input from a stranger's sticker (ADR-0034), so every
// decision about what a visitor may do with one is made here, away from the DOM,
// and unit-tested in `./__tests__/scan.test.ts`. Nothing in this module touches
// the network, the camera or the filesystem.

import { CERT_CODE_REGEX } from './certificate-code';

/**
 * The formats the Scanner asks a detector for: the 2D set plus the common 1D
 * retail and industrial symbologies, so "any QR & barcode" is not a half-truth.
 */
export const SCAN_FORMATS = [
  'aztec',
  'codabar',
  'code_39',
  'code_93',
  'code_128',
  'data_matrix',
  'ean_8',
  'ean_13',
  'itf',
  'pdf417',
  'qr_code',
  'upc_a',
  'upc_e',
  'databar',
] as const;

export type ScanFormat = (typeof SCAN_FORMATS)[number];

/** Arabic names for the formats a Scan Result reports. Unknown ones fall through. */
export const SCAN_FORMAT_LABELS: Record<string, string> = {
  qr_code: 'QR',
  micro_qr_code: 'QR مصغَّر',
  aztec: 'Aztec',
  data_matrix: 'Data Matrix',
  pdf417: 'PDF417',
  code_128: 'Code 128',
  code_39: 'Code 39',
  code_93: 'Code 93',
  codabar: 'Codabar',
  itf: 'ITF',
  ean_13: 'EAN-13',
  ean_8: 'EAN-8',
  upc_a: 'UPC-A',
  upc_e: 'UPC-E',
  databar: 'GS1 DataBar',
};

export type ScanResultKind =
  'link' | 'email' | 'phone' | 'sms' | 'wifi' | 'contact' | 'location' | 'otp' | 'text';

export const SCAN_RESULT_KIND_LABELS: Record<ScanResultKind, string> = {
  link: 'رابط',
  email: 'بريد إلكترونيّ',
  phone: 'رقم هاتف',
  sms: 'رسالة نصِّيَّة',
  wifi: 'شبكة WiFi',
  contact: 'جهة اتِّصال',
  location: 'موقع جغرافيّ',
  otp: 'رمز تحقُّق بخطوتين',
  text: 'نصّ',
};

export interface WifiCredentials {
  ssid: string;
  password: string | null;
  encryption: string | null;
  hidden: boolean;
}

export interface OtpDetails {
  type: string;
  label: string | null;
  issuer: string | null;
  secret: string;
}

export interface ScanClassification {
  kind: ScanResultKind;
  /** The payload as decoded, trimmed. Rendered as text only, never as HTML. */
  value: string;
  /** The single destination the page may offer to open, or `null` for no action. */
  actionHref: string | null;
  /** Arabic label for the action, paired with `actionHref`. */
  actionLabel: string | null;
  /**
   * For a link, the host the visitor is *actually* about to reach. Shown before
   * they commit, because `https://our-site.com@evil.example` reads as ours and
   * resolves elsewhere.
   */
  host: string | null;
  /** A scheme we refuse to open, kept so the page can explain the refusal. */
  refusedScheme: string | null;
  /** True when the destination is punycode or carries user-info. */
  deceptive: boolean;
  wifi: WifiCredentials | null;
  otp: OtpDetails | null;
}

/** Longest payload we will render in full; the rest is truncated but still copyable. */
export const SCAN_PREVIEW_LENGTH = 400;

/** Longest payload we accept from a detector at all. */
export const SCAN_MAX_PAYLOAD_LENGTH = 8192;

/** The `geo:`, `mailto:`, `tel:` and `sms:` payloads the page will hand over. */
const OPENABLE_ACTIONS: Record<string, { kind: ScanResultKind; label: string }> = {
  'mailto:': { kind: 'email', label: 'إرسال بريد' },
  'tel:': { kind: 'phone', label: 'اتِّصال' },
  'sms:': { kind: 'sms', label: 'إرسال رسالة' },
  'geo:': { kind: 'location', label: 'فتح الموقع' },
};

/** Every scheme the page is willing to hand to the browser. The rest is text. */
const OPENABLE_SCHEMES = new Set(['http:', 'https:', ...Object.keys(OPENABLE_ACTIONS)]);

const SCHEME_PATTERN = /^([a-zA-Z][a-zA-Z0-9+.-]*):/;

function schemeOf(value: string): string | null {
  const scheme = SCHEME_PATTERN.exec(value)?.[1];
  return scheme ? `${scheme.toLowerCase()}:` : null;
}

/**
 * Punycode (`xn--`) and raw non-ASCII hosts are how a link impersonates a
 * familiar domain, so they earn a warning rather than a silent open.
 */
function isDeceptiveHost(hostname: string): boolean {
  if (/^xn--/i.test(hostname) || /\.xn--/i.test(hostname)) return true;
  for (const char of hostname) {
    if (char.charCodeAt(0) > 127) return true;
  }
  return false;
}

/** Truncates for display only. The full `value` stays copyable. */
export function truncateForDisplay(value: string): string {
  return value.length > SCAN_PREVIEW_LENGTH ? `${value.slice(0, SCAN_PREVIEW_LENGTH)}…` : value;
}

function text(value: string, refusedScheme: string | null = null): ScanClassification {
  return {
    kind: 'text',
    value,
    actionHref: null,
    actionLabel: null,
    host: null,
    refusedScheme,
    deceptive: false,
    wifi: null,
    otp: null,
  };
}

/**
 * The `WIFI:` payload format, as printed on the back of every router:
 * `WIFI:T:WPA;S:<ssid>;P:<password>;H:<hidden>;;`
 *
 * The SSID and password are escaped with `\` before `;`, `,`, `:` and `\`, so
 * the split has to honour that rather than naively cutting on `;`.
 */
export function parseWifiPayload(value: string): WifiCredentials | null {
  const fields = new Map<string, string>();
  const parts: string[] = [];
  let current = '';
  let escaped = false;

  for (const char of value.slice(5)) {
    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }
    if (char === '\\') {
      escaped = true;
      continue;
    }
    if (char === ';') {
      parts.push(current);
      current = '';
      continue;
    }
    current += char;
  }
  parts.push(current);

  for (const part of parts) {
    const separator = part.indexOf(':');
    if (separator < 1) continue;
    fields.set(part.slice(0, separator).toUpperCase(), part.slice(separator + 1));
  }

  const ssid = fields.get('S');
  if (!ssid) return null;

  return {
    ssid,
    password: fields.get('P') ?? null,
    encryption: fields.get('T') ?? null,
    hidden: (fields.get('H') ?? '').toLowerCase() === 'true',
  };
}

/** The `otpauth://totp/Issuer:Account?secret=…&issuer=…` payload format. */
export function parseOtpPayload(value: string): OtpDetails | null {
  try {
    const url = new URL(value);
    const secret = url.searchParams.get('secret');
    if (!secret) return null;

    const path = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    let pathIssuer: string | null = null;
    let pathLabel: string | null = null;
    if (path.includes(':')) {
      const [issuerPart, ...labelParts] = path.split(':');
      pathIssuer = issuerPart || null;
      pathLabel = labelParts.join(':') || null;
    } else {
      pathLabel = path || null;
    }

    return {
      type: url.hostname || 'totp',
      label: pathLabel,
      issuer: url.searchParams.get('issuer') ?? pathIssuer,
      secret,
    };
  } catch {
    return null;
  }
}

/** The display name out of a vCard, when it carries one. */
export function contactName(value: string): string | null {
  const name = /^FN(?:;[^:]*)?:(.+)$/im.exec(value)?.[1];
  return name ? name.trim() : null;
}

/**
 * The Certificate Code inside one of our own verification links, or `null` when
 * the payload is not one.
 *
 * The origin is required, not inferred: a lookalike link on someone else's domain
 * must stay a bare link, because rendering our Certificate card for it would
 * present a stranger's URL as ours.
 */
export function certificateCodeFromPayload(payload: string, origin: string): string | null {
  const scheme = schemeOf(payload);
  if (scheme !== 'http:' && scheme !== 'https:') return null;
  try {
    const url = new URL(payload);
    if (url.origin !== origin) return null;
    const raw = /^\/verify\/([^/?#]+)\/?$/.exec(url.pathname)?.[1];
    if (!raw) return null;
    const code = decodeURIComponent(raw).toUpperCase();
    return CERT_CODE_REGEX.test(code) ? code : null;
  } catch {
    return null;
  }
}

/**
 * Classifies a decoded payload and decides the single action, if any, a visitor
 * may take on it. A scheme outside the openable set yields plain text with
 * `refusedScheme` set: `javascript:`, `data:`, `file:` and `intent:` payloads
 * earn a warning, never an open button.
 */
export function classifyScanPayload(raw: string): ScanClassification {
  const value = raw.replace(/\r\n/g, '\n').trim();

  if (value.length === 0) return text(value);
  if (value.length > SCAN_MAX_PAYLOAD_LENGTH) return text(value.slice(0, SCAN_MAX_PAYLOAD_LENGTH));

  const lower = value.toLowerCase();

  if (lower.startsWith('wifi:')) {
    const wifi = parseWifiPayload(value);
    if (wifi) return { ...text(value), kind: 'wifi', wifi };
  }

  if (lower.startsWith('otpauth://')) {
    const otp = parseOtpPayload(value);
    if (otp) return { ...text(value), kind: 'otp', otp };
  }

  if (lower.startsWith('begin:vcard')) {
    return { ...text(value), kind: 'contact' };
  }

  const scheme = schemeOf(value);

  if (scheme === 'http:' || scheme === 'https:') {
    try {
      const url = new URL(value);
      return {
        ...text(value),
        kind: 'link',
        actionHref: url.href,
        actionLabel: 'فتح الرَّابط',
        host: url.host,
        deceptive: url.username !== '' || url.password !== '' || isDeceptiveHost(url.hostname),
      };
    } catch {
      return text(value);
    }
  }

  if (scheme && OPENABLE_SCHEMES.has(scheme)) {
    const action = OPENABLE_ACTIONS[scheme];
    if (action) {
      return { ...text(value), kind: action.kind, actionHref: value, actionLabel: action.label };
    }
  }

  if (scheme) return text(value, scheme);

  return text(value);
}
