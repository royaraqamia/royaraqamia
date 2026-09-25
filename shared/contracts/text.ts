/**
 * Shared text normalisation for contract inputs.
 *
 * A form submits an untouched optional field as an empty string, so both the
 * schema boundary and the persistence boundary need one agreed answer to "is
 * this blank?". It is `null`: a missing value must never reach the database as
 * `''`, where it would be indistinguishable from a value the user cleared.
 */
export function toNullableText(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
