/**
 * Domain Service for validating URL structures and checking for potential security
 * threats, including phishing patterns, spam keywords, loopbacks, and private IP ranges.
 *
 * Every rule here classifies the parsed URL's host. Matching the raw string let a
 * destination merely *mention* a blocked word in its path or query be refused — a
 * public page about "how linksnap works" or a query of `10.0.0.1` is not a target
 * the redirect fetches, so it is not this guard's concern (#1218).
 */
import { AppError } from '@/backend/shared/errors';
import { isPublicIpAddress, normalizeHostname } from '@/shared/network';

const MALICIOUS_HOST_PATTERNS = [
  /phishing/i,
  /malware/i,
  /free-money-scam/i,
  /get-rich-quick/i,
  /hack-accounts/i,
];

/** This product's own short-link hosts: a destination on one of them is a redirect loop. */
const SELF_HOSTS = ['linksnap.app', 'linksnap.com'];

const FALLBACK_SITE_HOST = 'royaraqamia.com';

/**
 * The hosts the site itself answers on. Short links live at the site root (`/{code}`),
 * so a destination pointing back at one of these can resolve to another short link and
 * loop. Read at call time so a deployment's own origin is honoured, while the canonical
 * production host stays covered even when the environment overrides it.
 */
function siteHosts(): string[] {
  const configured = [
    process.env.NEXT_PUBLIC_SITE_URL,
    process.env.NEXT_PUBLIC_BASE_URL,
    process.env.APP_URL,
  ];

  const hosts = [FALLBACK_SITE_HOST];
  for (const value of configured) {
    if (!value?.trim()) continue;
    try {
      hosts.push(normalizeHostname(new URL(value).hostname.replace(/^\[|\]$/g, '')));
    } catch {
      // A malformed configured origin cannot widen the guard; the canonical host stays.
    }
  }
  return hosts;
}

function isHostOrSubdomain(host: string, candidate: string): boolean {
  return host === candidate || host.endsWith(`.${candidate}`);
}

/** The parsed host, or `null` when the string is not a URL at all. */
function hostOf(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    return normalizeHostname(parsed.hostname.replace(/^\[|\]$/g, ''));
  } catch {
    return null;
  }
}

/**
 * Whether the host is written as an IP literal. The WHATWG parser already normalizes
 * the odd forms (`http://2130706433/` and `http://0x7f.1/` both arrive as `127.0.0.1`),
 * so what reaches here is dotted IPv4 or a `::`-bearing IPv6 address.
 */
function isIpLiteral(host: string): boolean {
  return host.includes(':') || /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

export class SecurityValidator {
  /**
   * Validates if a string is a properly formatted HTTP/HTTPS URL.
   */
  public static isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'http:' || parsed.protocol === 'https:';
    } catch {
      return false;
    }
  }

  /**
   * Checks if a URL's host is a known malicious keyword, a private/loopback address, or
   * one of the site's own hosts. An unparseable value is treated as unsafe: a guard
   * should fail closed.
   */
  public static isMaliciousOrLoopback(url: string): boolean {
    const host = hostOf(url);
    if (!host) return true;

    // 1. A malicious keyword has to be part of the host: the path and query are content,
    // not the destination the redirect hands the browser.
    if (MALICIOUS_HOST_PATTERNS.some((pattern) => pattern.test(host))) {
      return true;
    }

    // 2. Loopback, private, link-local and unspecified targets, so a short link cannot be
    // pointed at the deployment's own network. Only IP literals are classified — a
    // hostname that *resolves* to a private address is not this guard's concern.
    if (host === 'localhost' || host.endsWith('.localhost')) return true;
    if (isIpLiteral(host) && !isPublicIpAddress(host)) return true;

    // 3. The product's own short-link hosts prevent a self-referencing redirect loop.
    if (SELF_HOSTS.some((own) => isHostOrSubdomain(host, own))) return true;
    if (siteHosts().some((own) => isHostOrSubdomain(host, own))) return true;

    return false;
  }

  /**
   * Validates a target URL and throws detailed descriptive domain errors if security rules are violated.
   */
  public static validateUrl(url: string): string {
    const sanitized = url.trim();

    if (!sanitized) {
      throw new AppError('URL cannot be empty.', 400);
    }

    if (!this.isValidUrl(sanitized)) {
      throw new AppError('Invalid URL format. Please include http:// or https://', 400);
    }

    if (this.isMaliciousOrLoopback(sanitized)) {
      throw new AppError(
        'Security Block: This URL has been flagged as suspicious, malicious, or an internal network loopback address.',
        400
      );
    }

    return sanitized;
  }
}
