/**
 * A reader's saved news-source selection, as the repository sees it.
 *
 * `null` and `[]` are different answers on purpose: no row means the reader has
 * never chosen (so a source approved later is not hidden from them), and an
 * empty array means they chose "everything". Both render the full digest today,
 * but only the first is worth keeping a distinction for — the picker shows
 * "no selection" rather than an empty checklist.
 */
export interface NewsPreferencesRepository {
  getSourceIds(userId: string): Promise<string[] | null>;
  saveSourceIds(userId: string, sourceIds: readonly string[]): Promise<void>;
}
