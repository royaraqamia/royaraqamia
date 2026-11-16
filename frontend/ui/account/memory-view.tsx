'use client';

import { useCallback, useEffect, useState } from 'react';

import {
  MEMORY_EXPORT_PATH,
  editAgentMemory,
  forgetAgentMemory,
  getAgentMemory,
  saveAgentMemorySettings,
} from '@/frontend/api/account-memory';
import { useSession } from '@/frontend/state/session-provider';
import { Skeleton } from '@/frontend/ui/primitives/skeleton';
import { Switch } from '@/frontend/ui/primitives/switch';
import { LoadingList } from '@/frontend/ui/shared/loading-skeletons';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { SignInCta } from '@/frontend/ui/shared/sign-in-cta';
import type {
  AgentMemoryFact,
  AgentMemoryScope,
  AgentMemorySettings,
} from '@/shared/contracts/agent-memory';

import { ACCOUNT_MEMORY_COPY } from './memory-copy';
import { factsOfScope, kindNeedsBadge, memoryDate } from './memory-format';

/** `/account/memory`: what the assistant remembers, and the controls over it. */
const MEMORY_ROUTE = '/account/memory';

/** The three scopes, in the order the page draws them. */
const SCOPES: readonly AgentMemoryScope[] = ['account', 'product', 'thread'];

const SECTION_LABEL: Readonly<Record<AgentMemoryScope, string>> = {
  account: ACCOUNT_MEMORY_COPY.factsAccount,
  product: ACCOUNT_MEMORY_COPY.factsProduct,
  thread: ACCOUNT_MEMORY_COPY.factsThread,
};

const DEFAULT_SETTINGS: AgentMemorySettings = { account: true, product: true, thread: true };

/** A fact's kind, in the member's words; a plain fact draws no badge at all. */
function kindLabel(fact: AgentMemoryFact): string | null {
  if (!kindNeedsBadge(fact.kind)) return null;
  switch (fact.kind) {
    case 'preference':
      return ACCOUNT_MEMORY_COPY.kindPreference;
    case 'health':
      return ACCOUNT_MEMORY_COPY.kindHealth;
    case 'legal':
      return ACCOUNT_MEMORY_COPY.kindLegal;
    case 'financial':
      return ACCOUNT_MEMORY_COPY.kindFinancial;
    default:
      return null;
  }
}

/**
 * The page before it arrives: the settings card with its switch row, the export
 * row and one list of facts. The skeleton is the page's own frame rather than a
 * centred spinner, so nothing jumps when the read lands.
 *
 * The loading sentence is announced once, on the fact list; the blocks above it
 * are decorative.
 */
function MemorySkeleton({ label }: { label: string }) {
  return (
    <div data-visual="memory-loading" className="space-y-6">
      <section className="rounded-2xl border border-border/70 bg-card/60 px-4 py-4">
        <Skeleton decorative className="h-3.5 w-36 max-w-full" />
        <Skeleton decorative className="mt-2.5 h-3 w-full" />
        <Skeleton decorative className="mt-1.5 h-3 w-2/3" />
        <div className="mt-4 flex items-center justify-between gap-3">
          <Skeleton decorative className="h-3 w-24 max-w-full" />
          <Skeleton decorative rounded="full" className="h-7 w-12 shrink-0" />
        </div>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/60 px-4 py-3">
        <Skeleton decorative className="h-3 w-2/3 max-w-full" />
        <Skeleton decorative className="h-7 w-16 shrink-0" />
      </section>

      <LoadingList label={label} rows={3} showTrailing={false} />
    </div>
  );
}

/**
 * What the assistant remembers (ADR-0182 decision 6, #1428).
 *
 * The page is the whole control surface: every fact the assistant can recall is
 * listed here and carries its own edit and forget buttons, one switch closes the
 * whole store without hiding what it already holds, and the export is the same
 * rows as a file. "Do not show a fact the member cannot delete" is why the list
 * is the store itself and not a derived view: a row drawn from a second table
 * would be a row with no button.
 *
 * The store's three scopes (`account`, `product`, `thread`) are the list's
 * headings and not three switches: where a fact is routed is the server's
 * business, while "remember or not" is the member's (ADR-0182's 2026-11-16
 * amendment). The one switch writes all three together.
 *
 * Like the rest of `/account`, it is a data-free shell: a guest is pointed at
 * sign-in, and the read runs on the client.
 */
export function MemoryView() {
  const { user, isLoading: isSessionLoading } = useSession();
  const [facts, setFacts] = useState<AgentMemoryFact[]>([]);
  const [settings, setSettings] = useState<AgentMemorySettings>(DEFAULT_SETTINGS);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const answer = await getAgentMemory();
      setFacts(answer.facts);
      setSettings(answer.settings);
      setLoadError(null);
    } catch (cause) {
      setLoadError(
        cause instanceof Error && cause.message ? cause.message : ACCOUNT_MEMORY_COPY.loadFailed
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) {
      setIsLoading(false);
      return;
    }
    void load();
  }, [load, user]);

  async function forget(fact: AgentMemoryFact) {
    setBusy(fact.id);
    try {
      await forgetAgentMemory(fact.id);
      setFacts((current) => current.filter((row) => row.id !== fact.id));
      setActionError(null);
      setStatus(ACCOUNT_MEMORY_COPY.forgotten);
    } catch (cause) {
      setActionError(
        cause instanceof Error && cause.message ? cause.message : ACCOUNT_MEMORY_COPY.forgetFailed
      );
    } finally {
      setBusy(null);
    }
  }

  async function save(fact: AgentMemoryFact) {
    setBusy(fact.id);
    try {
      await editAgentMemory(fact.id, { text: draft });
      setFacts((current) =>
        current.map((row) => (row.id === fact.id ? { ...row, text: draft.trim() } : row))
      );
      setEditing(null);
      setActionError(null);
      setStatus(ACCOUNT_MEMORY_COPY.saved);
    } catch (cause) {
      setActionError(
        cause instanceof Error && cause.message ? cause.message : ACCOUNT_MEMORY_COPY.saveFailed
      );
    } finally {
      setBusy(null);
    }
  }

  /** Whether Nour may remember at all: on only when every scope is open. */
  const isRemembering = settings.account && settings.product && settings.thread;

  async function toggle() {
    const next = !isRemembering;
    setBusy('settings');
    try {
      const answer = await saveAgentMemorySettings({
        account: next,
        product: next,
        thread: next,
      });
      setSettings(answer);
      setActionError(null);
    } catch (cause) {
      setActionError(
        cause instanceof Error && cause.message
          ? cause.message
          : ACCOUNT_MEMORY_COPY.settingsSaveFailed
      );
    } finally {
      setBusy(null);
    }
  }

  if (isSessionLoading) {
    return <MemorySkeleton label={ACCOUNT_MEMORY_COPY.loadingLabel} />;
  }

  if (!user) {
    return (
      <div
        data-visual="memory-signed-out"
        className="flex flex-col items-center justify-center rounded-2xl border border-border/70 bg-card/60 px-4 py-14 text-center shadow-xs"
      >
        <p className="text-sm font-bold text-foreground">{ACCOUNT_MEMORY_COPY.signedOutTitle}</p>
        <SignInCta
          href={`/auth/login?redirect=${encodeURIComponent(MEMORY_ROUTE)}`}
          className="mt-4"
        >
          {ACCOUNT_MEMORY_COPY.signIn}
        </SignInCta>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div
        className="mb-8 flex flex-col items-center text-center sm:mb-10 lg:mb-12"
        data-visual="memory-title"
      >
        <SectionTitle as="h1">
          <SectionTitleHighlight>{ACCOUNT_MEMORY_COPY.pageTitle}</SectionTitleHighlight>
        </SectionTitle>
      </div>

      {isLoading ? (
        <MemorySkeleton label={ACCOUNT_MEMORY_COPY.loadingLabel} />
      ) : loadError ? (
        <p
          role="alert"
          data-visual="memory-error"
          className="rounded-2xl bg-destructive/10 px-4 py-3 text-xs font-medium text-destructive"
        >
          {loadError}
        </p>
      ) : (
        <>
          {actionError ? (
            <p
              role="alert"
              data-visual="memory-error"
              className="rounded-2xl bg-destructive/10 px-4 py-3 text-xs font-medium text-destructive"
            >
              {actionError}
            </p>
          ) : null}

          <section
            data-visual="memory-settings"
            className="rounded-2xl border border-border/70 bg-card/60 px-4 py-4"
          >
            <h2 className="text-sm font-bold text-foreground">
              {ACCOUNT_MEMORY_COPY.settingsTitle}
            </h2>
            <p className="mt-1 text-xs leading-6 text-muted-foreground">
              {ACCOUNT_MEMORY_COPY.settingsHint}
            </p>
            <div
              data-visual="memory-switch-row"
              className="mt-3 flex items-center justify-between gap-3"
            >
              <span className="text-xs font-bold text-foreground">
                {ACCOUNT_MEMORY_COPY.settingsLabel}
              </span>
              <Switch
                checked={isRemembering}
                data-visual="memory-switch"
                label={
                  isRemembering
                    ? ACCOUNT_MEMORY_COPY.settingsOffAria
                    : ACCOUNT_MEMORY_COPY.settingsOnAria
                }
                disabled={busy === 'settings'}
                onChange={() => void toggle()}
              />
            </div>
          </section>

          <section
            data-visual="memory-export"
            className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/70 bg-card/60 px-4 py-3"
          >
            <span className="text-xs text-muted-foreground">{ACCOUNT_MEMORY_COPY.exportHint}</span>
            <a
              href={MEMORY_EXPORT_PATH}
              download
              className="rounded-lg border border-border/70 px-3 py-1.5 text-xs font-bold text-foreground transition-safe hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
            >
              {ACCOUNT_MEMORY_COPY.export}
            </a>
          </section>

          {status ? (
            <p data-visual="memory-status" className="text-center text-xs text-muted-foreground">
              {status}
            </p>
          ) : null}

          {facts.length === 0 ? (
            <div
              data-visual="memory-empty"
              className="rounded-2xl border border-border/70 bg-card/60 px-4 py-8 text-center"
            >
              <p className="text-sm font-bold text-foreground">{ACCOUNT_MEMORY_COPY.emptyTitle}</p>
              <p className="mt-2 text-xs leading-6 text-muted-foreground/80">
                {ACCOUNT_MEMORY_COPY.emptyHint}
              </p>
            </div>
          ) : (
            SCOPES.filter((scope) => factsOfScope(facts, scope).length > 0).map((scope) => (
              <section key={scope} data-visual={`memory-section-${scope}`} className="space-y-2">
                <h2
                  data-visual={`memory-heading-${scope}`}
                  className="text-xs font-bold text-muted-foreground"
                >
                  {SECTION_LABEL[scope]}
                </h2>
                <ul
                  data-visual={`memory-list-${scope}`}
                  className="divide-y divide-border/40 overflow-hidden rounded-2xl border border-border/70 bg-card/60"
                >
                  {factsOfScope(facts, scope).map((fact, index) => {
                    const badge = kindLabel(fact);
                    const isEditing = editing === fact.id;
                    return (
                      <li
                        key={fact.id}
                        data-visual={`memory-row-${scope}-${index}`}
                        className="px-4 py-3"
                      >
                        {isEditing ? (
                          <div className="flex flex-col gap-2">
                            <textarea
                              data-visual={`memory-editor-${scope}-${index}`}
                              value={draft}
                              onChange={(event) => setDraft(event.target.value)}
                              rows={2}
                              maxLength={500}
                              className="w-full rounded-lg border border-border/70 bg-background px-3 py-2 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                            />
                            <div className="flex items-center gap-2">
                              <button
                                type="button"
                                data-visual={`memory-save-${scope}-${index}`}
                                onClick={() => void save(fact)}
                                disabled={busy === fact.id || !draft.trim()}
                                className="rounded-lg border border-border/70 px-3 py-1.5 text-xs font-bold text-foreground transition-safe hover:bg-accent disabled:opacity-50"
                              >
                                {ACCOUNT_MEMORY_COPY.save}
                              </button>
                              <button
                                type="button"
                                data-visual={`memory-cancel-${scope}-${index}`}
                                onClick={() => setEditing(null)}
                                className="rounded-lg px-3 py-1.5 text-xs font-medium text-muted-foreground transition-safe hover:bg-muted/40"
                              >
                                {ACCOUNT_MEMORY_COPY.cancel}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-start gap-3">
                            <div className="min-w-0 flex-1">
                              <p
                                data-visual={`memory-text-${scope}-${index}`}
                                className="text-sm leading-6 text-foreground"
                              >
                                {fact.text}
                              </p>
                              <p className="mt-1 flex items-center gap-2 text-xs text-muted-foreground/70">
                                {badge ? (
                                  <span
                                    data-visual={`memory-kind-${scope}-${index}`}
                                    className="rounded-full border border-border/70 px-2 py-0.5 text-[10px] font-bold"
                                  >
                                    {badge}
                                  </span>
                                ) : null}
                                <span dir="ltr" className="tabular-nums">
                                  {memoryDate(fact.updatedAt)}
                                </span>
                              </p>
                            </div>
                            <div className="flex shrink-0 items-center gap-1">
                              <button
                                type="button"
                                data-visual={`memory-edit-${scope}-${index}`}
                                onClick={() => {
                                  setEditing(fact.id);
                                  setDraft(fact.text);
                                }}
                                aria-label={ACCOUNT_MEMORY_COPY.editAria.replace(
                                  '{text}',
                                  fact.text
                                )}
                                className="rounded-lg border border-border/70 px-3 py-1.5 text-xs font-bold text-foreground transition-safe hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
                              >
                                {ACCOUNT_MEMORY_COPY.edit}
                              </button>
                              <button
                                type="button"
                                data-visual={`memory-delete-${scope}-${index}`}
                                onClick={() => void forget(fact)}
                                disabled={busy === fact.id}
                                aria-label={ACCOUNT_MEMORY_COPY.deleteAria.replace(
                                  '{text}',
                                  fact.text
                                )}
                                className="rounded-lg border border-border/70 px-3 py-1.5 text-xs font-bold text-destructive transition-safe hover:bg-destructive/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50"
                              >
                                {ACCOUNT_MEMORY_COPY.delete}
                              </button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </>
      )}
    </div>
  );
}
