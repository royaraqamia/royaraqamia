/**
 * A reader's saved news preferences, as the repository sees it.
 *
 * `null` and `[]` are different answers on purpose: no row means the reader has
 * never chosen (so a source approved later is not hidden from them), and an
 * empty array means they chose "everything". Both render the full digest today,
 * but only the first is worth keeping a distinction for — the picker shows
 * "no selection" rather than an empty checklist.
 *
 * The digest's own delivery is not a preference: it is on for every account
 * (ADR-0131), so the column is written true and never read back.
 */
export interface StoredNewsPreferences {
  sourceIds: string[] | null;
}

export interface NewsPreferencesRepository {
  getPreferences(userId: string): Promise<StoredNewsPreferences | null>;
  savePreferences(userId: string, preferences: { sourceIds: readonly string[] }): Promise<void>;
}
