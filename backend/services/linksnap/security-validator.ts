/**
 * Domain Service for validating URL structures and checking for potential security
 * threats, including phishing patterns, spam keywords, loopbacks, and private IP ranges.
 */

const MALICIOUS_PATTERNS = [
  /phishing/i,
  /malware/i,
  /free-money-scam/i,
  /get-rich-quick/i,
  /hack-accounts/i,
];

const LOOPBACK_PATTERNS = [
  /localhost/i,
  /127\.0\.0\.1/i,
  /192\.168\./i,
  /10\.\d+\.\d+\.\d+/i,
  /172\.(1[6-9]|2\d|3[0-1])\.\d+\.\d+/i,
  /0\.0\.0\.0/i,
  /linksnap/i, // prevent infinite self-referencing redirect loops
];

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
   * Checks if a URL contains known malicious keywords or is a private/loopback IP address.
   */
  public static isMaliciousOrLoopback(url: string): boolean {
    const sanitizedUrl = url.trim().toLowerCase();

    // 1. Check malicious pattern matching
    const matchesMalicious = MALICIOUS_PATTERNS.some((pattern) => pattern.test(sanitizedUrl));
    if (matchesMalicious) {
      return true;
    }

    // 2. Check local/loopback matching to prevent SSRF and infinite loops
    const matchesLoopback = LOOPBACK_PATTERNS.some((pattern) => pattern.test(sanitizedUrl));
    if (matchesLoopback) {
      return true;
    }

    return false;
  }

  /**
   * Validates a target URL and throws detailed descriptive domain errors if security rules are violated.
   */
  public static validateUrl(url: string): string {
    const sanitized = url.trim();

    if (!sanitized) {
      throw new Error('URL cannot be empty.');
    }

    if (!this.isValidUrl(sanitized)) {
      throw new Error('Invalid URL format. Please include http:// or https://');
    }

    if (this.isMaliciousOrLoopback(sanitized)) {
      throw new Error(
        'Security Block: This URL has been flagged as suspicious, malicious, or an internal network loopback address.'
      );
    }

    return sanitized;
  }
}
