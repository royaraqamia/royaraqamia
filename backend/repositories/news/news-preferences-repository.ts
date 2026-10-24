/**
 * A reader's saved news preferences, as the repository sees it.
 *
 * `null` and `[]` are different answers on purpose: no row means the reader has
 * never chosen (so a source approved later is not hidden from them), and an
 * empty array means they chose "everything". Both render the full digest today,
 * but only the first is worth keeping a distinction for — the picker shows
 * "no selection" rather than an empty checklist.
 */
export interface StoredNewsPreferences {
  sourceIds: string[] | null;
  /** True once the reader asked for a digest of their own (ADR-0079). */
  personalEnabled: boolean;
}

export interface NewsPreferencesRepository {
  getPreferences(userId: string): Promise<StoredNewsPreferences | null>;
  savePreferences(
    userId: string,
    preferences: { sourceIds: readonly string[]; personalEnabled: boolean }
  ): Promise<void>;
}
