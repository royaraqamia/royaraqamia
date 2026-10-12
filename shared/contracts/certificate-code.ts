// The Certificate Code format, alone in its own module.
//
// `shared/contracts/certificates.ts` also imports `zod`, and the Scanner only
// needs this one pattern to recognise our own verification links. Keeping it
// separate keeps the schema library out of the Scanner's first paint.

// Certificate Code Format: COMP-YYYY-XXXXXXXX (8 alphanumeric chars)
// Example: COMP-2026-A1B2C3D4
export const CERT_CODE_REGEX = /^COMP-\d{4}-[A-Z0-9]{8}$/;
