'use client';

import { useCallback, useEffect, useId, useState } from 'react';
import Link from 'next/link';
import { Brain, Cpu, Loader2, Plug, RotateCcw } from 'lucide-react';

import {
  getAssistantIdentity,
  resetAssistantIdentity,
  saveAssistantIdentity,
} from '@/frontend/api/assistant-identity';
import { writeAssistantSnapshot } from '@/frontend/api/chats/assistant-cache';
import { useLocalIdentity } from '@/frontend/state/use-local-identity';
import { useSession } from '@/frontend/state/session-provider';
import { cn } from '@/frontend/shared/cn';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import { LockedCard } from '@/frontend/ui/shared/locked-card';
import { SectionTitle, SectionTitleHighlight } from '@/frontend/ui/shared/section-title';
import { AssistantOrb } from '@/frontend/ui/assistant/assistant-orb';
import { AssistantGrantsView } from '@/frontend/ui/assistant/grants-view';
import { ASSISTANT_NAME_MAX, type AssistantIdentity } from '@/shared/contracts/assistant-identity';

import { ASSISTANT_HOME_COPY as COPY } from './assistant-home-copy';

/**
 * `/assistant`: the assistant's own page (ADR-0224).
 *
 * It is the index, not a second settings site: the member's name and mark at the
 * top, the permissions it holds under them, and three rows to the pages that own
 * what it remembers, which apps it can call and what it has run. Nothing here is
 * public and nothing here is a profile — a name is a member's own copy, and a
 * shared surface draws the site's neutral «المساعد».
 *
 * The page is a data-free shell: the read, the save and the guard all run on the
 * client, so the document stays cacheable (the rest of the account area works the
 * same way, #448).
 */
export function AssistantHomeView() {
  const { user, isLoading: isSessionLoading } = useSession();
  const { identity: localIdentity } = useLocalIdentity();
  const nameFieldId = useId();
  const hintId = useId();

  const [identity, setIdentity] = useState<AssistantIdentity | null>(null);
  const [draft, setDraft] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadFailed(false);
    setIsLoading(true);
    try {
      const result = await getAssistantIdentity();
      if (!result.success || !result.identity) {
        setLoadFailed(true);
        return;
      }
      setIdentity(result.identity);
      setDraft(result.identity.customName ?? '');
    } catch {
      setLoadFailed(true);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isSessionLoading || !user) return;
    void load();
  }, [isSessionLoading, user, load]);

  async function save() {
    if (!identity) return;
    setIsSaving(true);
    setNotice(null);
    setError(null);
    try {
      const trimmed = draft.trim();
      const result = await saveAssistantIdentity({
        name: trimmed === '' ? null : trimmed,
        avatarVariant: identity.avatarVariant,
        tone: identity.tone,
        note: identity.note,
      });
      if (!result.success || !result.identity) {
        setError(result.error ?? COPY.saveFailed);
        return;
      }
      setIdentity(result.identity);
      setDraft(result.identity.customName ?? '');
      setNotice(COPY.saved);
      // The panel paints the name before it asks the server anything (ADR-0150),
      // so the name is written where the panel reads its first face.
      writeAssistantSnapshot(localIdentity, { name: result.identity.name });
    } finally {
      setIsSaving(false);
    }
  }

  async function reset() {
    setIsResetting(true);
    setNotice(null);
    setError(null);
    try {
      const result = await resetAssistantIdentity();
      if (!result.success || !result.identity) {
        setError(result.error ?? COPY.resetFailed);
        return;
      }
      setIdentity(result.identity);
      setDraft('');
      setNotice(COPY.resetDone);
      setConfirmReset(false);
      writeAssistantSnapshot(localIdentity, { name: result.identity.name });
    } finally {
      setIsResetting(false);
    }
  }

  if (isSessionLoading) {
    return <HomeSkeleton />;
  }

  if (!user) {
    return (
      <LockedCard
        title={COPY.guestTitle}
        body={COPY.guestBody}
        href={`/auth/login?redirect=${encodeURIComponent('/assistant')}`}
        ctaLabel={COPY.signIn}
      />
    );
  }

  if (isLoading && !identity) {
    return <HomeSkeleton />;
  }

  if (loadFailed && !identity) {
    return (
      <div className="space-y-3 rounded-2xl border border-destructive/30 bg-destructive/5 p-5 text-center">
        <p className="text-sm font-bold text-destructive">{COPY.loadFailed}</p>
        <button
          type="button"
          onClick={() => void load()}
          className="mx-auto inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-4 py-2 text-sm font-bold text-foreground transition-safe hover:border-primary/30 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30"
        >
          <RotateCcw aria-hidden="true" className="h-4 w-4" />
          <span>{COPY.retry}</span>
        </button>
      </div>
    );
  }

  if (!identity) return null;

  const dirty = draft.trim() !== (identity.customName ?? '');
  const canReset = identity.updatedAt !== null;

  return (
    <div className="space-y-8">
      <header className="space-y-2 text-center">
        <p className="text-xs font-bold tracking-wide text-primary">{COPY.eyebrow}</p>
        <SectionTitle as="h1" size="card">
          <SectionTitleHighlight>{identity.name}</SectionTitleHighlight>
        </SectionTitle>
        <p className="mx-auto max-w-md text-sm leading-relaxed text-muted-foreground">
          {COPY.lead}
        </p>
      </header>

      <section
        aria-label={COPY.nameLabel}
        className="rounded-2xl border border-border/50 bg-card/60 p-5"
      >
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (dirty && !isSaving) void save();
          }}
        >
          <div className="flex items-center gap-4">
            <AssistantOrb className="size-14" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <label htmlFor={nameFieldId} className="block text-sm font-bold text-foreground">
                {COPY.nameLabel}
              </label>
              <input
                id={nameFieldId}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                maxLength={ASSISTANT_NAME_MAX}
                placeholder={identity.name}
                dir="auto"
                aria-describedby={hintId}
                className="w-full rounded-xl border border-border/60 bg-background px-3 py-2 text-base font-bold text-foreground outline-none transition-safe placeholder:font-normal placeholder:text-muted-foreground/70 focus-visible:border-primary/50 focus-visible:ring-2 focus-visible:ring-primary/20"
              />
            </div>
          </div>

          <p id={hintId} className="text-xs leading-relaxed text-muted-foreground">
            {COPY.nameHint}
          </p>

          {error && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm font-bold text-destructive"
            >
              {error}
            </p>
          )}
          {notice && (
            <p
              role="status"
              className="rounded-xl border border-primary/25 bg-primary/5 px-3 py-2 text-sm font-bold text-primary"
            >
              {notice}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={!dirty || isSaving}
              className="inline-flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/10 px-4 py-2 text-sm font-bold text-primary transition-safe hover:bg-primary/15 active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50"
            >
              {isSaving && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
              <span>{isSaving ? COPY.saving : COPY.save}</span>
            </button>

            <button
              type="button"
              disabled={!canReset || isResetting}
              onClick={() => setConfirmReset(true)}
              className="inline-flex items-center gap-2 rounded-xl border border-border/60 bg-card/60 px-4 py-2 text-sm font-bold text-foreground transition-safe hover:border-primary/30 hover:bg-primary/10 hover:text-primary active:scale-[0.99] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50"
            >
              <RotateCcw aria-hidden="true" className="h-4 w-4" />
              <span>{COPY.reset}</span>
            </button>
          </div>
        </form>
      </section>

      <section aria-label={COPY.eyebrow} className="space-y-3">
        <AssistantGrantsView />
      </section>

      <section aria-labelledby="assistant-sections-title" className="space-y-3">
        <h2 id="assistant-sections-title" className="font-bold text-foreground">
          {COPY.sectionsTitle}
        </h2>
        <nav className="flex flex-col gap-2.5">
          <HomeRow
            href="/account/memory"
            icon={Brain}
            title={COPY.memoryTitle}
            body={COPY.memoryBody}
            openLabel={COPY.open}
          />
          <HomeRow
            href="/mcp/apps?tab=inbound"
            icon={Plug}
            title={COPY.appsTitle}
            body={COPY.appsBody}
            openLabel={COPY.open}
          />
          <HomeRow
            href="/coding"
            icon={Cpu}
            title={COPY.codingTitle}
            body={COPY.codingBody}
            openLabel={COPY.open}
          />
        </nav>
      </section>

      <ConfirmDialog
        open={confirmReset}
        title={COPY.resetTitle}
        message={COPY.resetMessage}
        confirmLabel={COPY.resetConfirm}
        cancelLabel={COPY.cancel}
        onConfirm={() => void reset()}
        onCancel={() => {
          if (!isResetting) setConfirmReset(false);
        }}
        isConfirming={isResetting}
        variant="danger"
      />
    </div>
  );
}

function HomeRow({
  href,
  icon: Icon,
  title,
  body,
  openLabel,
}: {
  href: string;
  icon: typeof Brain;
  title: string;
  body: string;
  openLabel: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex items-center justify-between gap-3 rounded-2xl border border-border/50 bg-card/60 px-4 py-3.5',
        'text-start transition-safe duration-150 ease-out hover:border-primary/30 hover:bg-primary/10',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
      )}
    >
      <span className="flex min-w-0 items-center gap-3">
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
        <span className="min-w-0 space-y-1">
          <span className="block truncate text-sm font-bold text-foreground sm:text-base">
            {title}
          </span>
          <span className="block text-xs text-muted-foreground">{body}</span>
        </span>
      </span>
      <span className="shrink-0 text-xs font-bold text-primary/80 group-hover:text-primary">
        {openLabel}
      </span>
    </Link>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label={COPY.loading}>
      <div className="mx-auto h-8 w-40 rounded-lg bg-muted/60 animate-pulse" />
      <div className="h-36 rounded-2xl border border-border/40 bg-muted/40 animate-pulse" />
      <div className="h-16 rounded-2xl border border-border/40 bg-muted/40 animate-pulse" />
      <div className="h-16 rounded-2xl border border-border/40 bg-muted/40 animate-pulse" />
    </div>
  );
}
