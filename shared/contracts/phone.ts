/**
 * Shared phone validation.
 *
 * `whatsappPhoneRegex` is deliberately permissive: people type numbers with
 * spaces, dashes and an optional leading `+`, and the country code is picked
 * separately by the country phone input. So we validate character shape and
 * length only, not routing.
 */
export const whatsappPhoneRegex = /^[+]?[\d\s-]{7,20}$/;
