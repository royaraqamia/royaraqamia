'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { Brain, Camera, Cpu, Loader2, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import {
  getAssistantIdentity,
  removeAssistantAvatar,
  saveAssistantIdentity,
  uploadAssistantAvatar,
} from '@/frontend/api/assistant-identity';
import { writeAssistantSnapshot } from '@/frontend/api/chats/assistant-cache';
import { useLocalIdentity } from '@/frontend/state/use-local-identity';
import { useSession } from '@/frontend/state/session-provider';
import { cn } from '@/frontend/shared/cn';
import { Button } from '@/frontend/ui/primitives/button';
import { Dialog, DialogContent, DialogTitle } from '@/frontend/ui/primitives/dialog';
import { Input } from '@/frontend/ui/primitives/input';
import { ConfirmDialog } from '@/frontend/ui/shared/confirm-dialog';
import { DialogActions } from '@/frontend/ui/shared/dialog-actions';
import { HeroCtaButton } from '@/frontend/ui/shared/hero-cta-button';
import { LockedCard } from '@/frontend/ui/shared/locked-card';
import { ProfileHeader } from '@/frontend/ui/shared/profile-header';
import { AssistantOrb } from '@/frontend/ui/assistant/assistant-orb';
import { AssistantGrantsView } from '@/frontend/ui/assistant/grants-view';
import { LastSeenLine } from '@/frontend/ui/chats/last-seen';
import { assistantOnlineLabels } from '@/frontend/ui/chats/last-seen-labels';
import { SITE_NAME } from '@/frontend/shared/metadata';
import { AVATAR_ALLOWED_MIME_TYPES, AVATAR_MAX_BYTES } from '@/shared/contracts/users';
import {
  ASSISTANT_DEFAULT_VOICE,
  ASSISTANT_NAME_MAX,
  ASSISTANT_VOICES,
  AssistantNameSchema,
  type AssistantIdentity,
  type AssistantVoice,
} from '@/shared/contracts/assistant-identity';

import { ASSISTANT_HOME_COPY as COPY } from './assistant-home-copy';

/**
 * `/assistant`: the assistant's own page (ADR-0224, ADR-0228).
 *
 * It is the index, not a second settings site: the member's name and mark at the
 * top, the permissions it holds under them, and two rows to the pages that own
 * what it remembers and what it has run. Nothing here is
 * public and nothing here is a profile — a name is a member's own copy, and a
 * shared surface draws the site's neutral «المساعد».
 *
 * The header is the member profile's header: the same cover band, the same
 * avatar-sized mark overlapping it and the same centred name and status line,
 * because the assistant belongs to the member whose profile draws it. The band
 * is seeded from the member's id, exactly as `/u/[username]` is.
 *
 * The name and the face are edited the way the account card edits the member's
 * own (ADR-0228, #946): a pen beside the name, a camera badge on the mark, and a
 * dialog behind each. The page used to draw a name field and a save button in the
 * body; the header is now the only place the identity is written.
 *
 * The page is a data-free shell: the read, the save and the guard all run on the
 * client, so the document stays cacheable (the rest of the account area works the
 * same way, #448).
 */

const iconButtonClasses =
  'inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-card/60 text-foreground transition-safe duration-150 ease-out hover:bg-primary/10 hover:text-primary hover:border-primary/30 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30 disabled:opacity-50 disabled:pointer-events-none';

const dialogClassName =
  'sm:max-w-md w-[calc(100%-2rem)] mx-auto p-6 sm:p-8 rounded-2xl sm:rounded-3xl border border-border/80 bg-background shadow-2xl';

const VOICE_LABELS: Record<AssistantVoice, string> = {
  feminine: COPY.voiceFeminine,
  masculine: COPY.voiceMasculine,
};

export function AssistantHomeView() {
  const { user, isLoading: isSessionLoading, refreshAssistantIdentity } = useSession();
  const { identity: localIdentity } = useLocalIdentity();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [identity, setIdentity] = useState<AssistantIdentity | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);

  const [nameDialogOpen, setNameDialogOpen] = useState(false);
  const [nameValue, setNameValue] = useState('');
  const [voiceValue, setVoiceValue] = useState<AssistantVoice>(ASSISTANT_DEFAULT_VOICE);
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);

  const [avatarDialogOpen, setAvatarDialogOpen] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [removingAvatar, setRemovingAvatar] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [imageFailed, setImageFailed] = useState(false);

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

  useEffect(() => {
    setImageFailed(false);
  }, [identity?.avatarUrl]);

  // The tab title is the member's own name (ADR-0229). The route's static title
  // is the default, because the document is cacheable and carries no member data.
  const identityName = identity?.name ?? null;
  useEffect(() => {
    if (!identityName) return;
    document.title = `${identityName} | ${SITE_NAME}`;
  }, [identityName]);

  const openNameDialog = () => {
    if (!identity) return;
    setNameValue(identity.customName ?? '');
    setVoiceValue(identity.voice);
    setNameError(null);
    setNameDialogOpen(true);
  };

  const closeNameDialog = () => {
    setNameDialogOpen(false);
    setNameError(null);
  };

  async function saveName(event?: React.FormEvent) {
    event?.preventDefault();
    if (!identity || savingName) return;

    const trimmed = nameValue.trim();
    if (trimmed !== '') {
      const parsed = AssistantNameSchema.safeParse(nameValue);
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        setNameError(
          issue?.code === 'too_big'
            ? COPY.nameTooLong
            : issue?.code === 'too_small'
              ? COPY.nameRequired
              : (issue?.message ?? COPY.invalidName)
        );
        return;
      }
    }

    setNameError(null);
    setSavingName(true);
    try {
      const result = await saveAssistantIdentity({
        name: trimmed === '' ? null : trimmed,
        avatarVariant: identity.avatarVariant,
        voice: voiceValue,
        tone: identity.tone,
        note: identity.note,
      });
      if (!result.success || !result.identity) {
        setNameError(result.error ?? COPY.nameFailed);
        return;
      }
      setIdentity(result.identity);
      setNameDialogOpen(false);
      toast.success(COPY.nameSaved);
      // The panel paints the name before it asks the server anything (ADR-0150),
      // so the name is written where the panel reads its first face.
      writeAssistantSnapshot(localIdentity, { name: result.identity.name });
      void refreshAssistantIdentity();
    } catch (error) {
      setNameError(error instanceof Error ? error.message : COPY.nameFailed);
    } finally {
      setSavingName(false);
    }
  }

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (!(AVATAR_ALLOWED_MIME_TYPES as readonly string[]).includes(file.type)) {
      toast.error(COPY.invalidImage);
      return;
    }
    if (file.size > AVATAR_MAX_BYTES) {
      toast.error(COPY.imageTooLarge);
      return;
    }

    setUploadingAvatar(true);
    try {
      const result = await uploadAssistantAvatar(file);
      if (!result.success || !result.identity) {
        toast.error(result.error ?? COPY.avatarFailed);
        return;
      }
      setIdentity(result.identity);
      setAvatarDialogOpen(false);
      toast.success(COPY.avatarSaved);
      void refreshAssistantIdentity();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : COPY.avatarFailed);
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleRemoveAvatar = async () => {
    setRemovingAvatar(true);
    try {
      const result = await removeAssistantAvatar();
      if (!result.success || !result.identity) {
        toast.error(result.error ?? COPY.avatarRemoveFailed);
        return;
      }
      setIdentity(result.identity);
      setAvatarDialogOpen(false);
      toast.success(COPY.avatarRemoved);
      void refreshAssistantIdentity();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : COPY.avatarRemoveFailed);
    } finally {
      setRemovingAvatar(false);
      setConfirmDeleteOpen(false);
    }
  };

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

  const showAvatar = Boolean(identity.avatarUrl) && !imageFailed;

  return (
    <div className="space-y-8">
      <ProfileHeader
        memberId={user.id}
        dataVisual="assistant-header"
        avatar={
          <button
            type="button"
            data-visual="assistant-avatar"
            onClick={() => setAvatarDialogOpen(true)}
            aria-label={showAvatar ? COPY.editAvatar : COPY.addAvatar}
            className="group relative size-20 shrink-0 rounded-full transition-transform duration-200 hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            <span className="relative flex size-full items-center justify-center overflow-hidden rounded-full border border-primary/20 bg-primary/10 p-[2px]">
              <AssistantOrb className="size-full" />
              {showAvatar && (
                <Image
                  src={identity.avatarUrl!}
                  alt=""
                  width={80}
                  height={80}
                  unoptimized
                  onError={() => setImageFailed(true)}
                  className="absolute inset-0 size-full object-cover"
                />
              )}
              {uploadingAvatar && (
                <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                  <Loader2 className="size-5 animate-spin text-primary" aria-hidden="true" />
                </span>
              )}
            </span>
            <span className="absolute -bottom-0.5 -inset-e-0.5 flex size-5 items-center justify-center rounded-full border border-selected/20 bg-selected text-selected-foreground shadow-sm transition-transform duration-200 group-hover:scale-110">
              <Camera className="size-3" aria-hidden="true" />
            </span>
          </button>
        }
      >
        <div className="w-full">
          <div className="flex w-full items-center justify-center gap-1.5">
            {/* The spacer mirrors the pen exactly, so the name sits dead centre
                whatever it is called: the pen keeps its recognisable place
                beside the name without the pair pushing the name off-centre. A
                long name wraps inside its own box instead of sliding under the
                pen. */}
            <span aria-hidden="true" className="h-7 w-7 shrink-0" />
            <h1
              data-visual="assistant-name"
              className="min-w-0 text-center text-2xl font-bold tracking-tight text-foreground [overflow-wrap:anywhere] sm:text-3xl"
            >
              {identity.name}
            </h1>
            <button
              type="button"
              onClick={openNameDialog}
              aria-label={COPY.editName}
              className={cn(iconButtonClasses, 'h-7 w-7 shrink-0 rounded-lg')}
            >
              <Pencil className="size-3.5" aria-hidden="true" />
            </button>
          </div>
          <LastSeenLine
            labels={assistantOnlineLabels(identity.voice)}
            alwaysOnline
            className="mt-0.5 text-center text-sm"
          />
        </div>
      </ProfileHeader>

      <AssistantGrantsView />

      <nav aria-label={COPY.sectionsAria} className="flex flex-col gap-2.5">
        <HomeRow
          href="/account/memory"
          icon={Brain}
          title={COPY.memoryTitle}
          body={COPY.memoryBody}
        />
        <HomeRow href="/coding" icon={Cpu} title={COPY.codingTitle} body={COPY.codingBody} />
      </nav>

      <input
        ref={fileInputRef}
        type="file"
        accept={AVATAR_ALLOWED_MIME_TYPES.join(',')}
        onChange={handleFileSelect}
        className="hidden"
      />

      <Dialog
        open={nameDialogOpen}
        onOpenChange={(open) => {
          if (!open) closeNameDialog();
        }}
      >
        <DialogContent
          hideClose
          aria-describedby={undefined}
          className={cn(dialogClassName, 'gap-0')}
        >
          <DialogTitle className="sr-only">{COPY.editName}</DialogTitle>

          <form onSubmit={saveName} className="space-y-4">
            <div className="space-y-2.5">
              <label
                htmlFor="assistant-name"
                className="block text-[13px] font-medium text-foreground/80"
              >
                {COPY.nameLabel}
              </label>
              <Input
                id="assistant-name"
                autoFocus
                value={nameValue}
                onChange={(event) => {
                  setNameValue(event.target.value);
                  if (nameError) setNameError(null);
                }}
                maxLength={ASSISTANT_NAME_MAX}
                autoComplete="off"
                placeholder={identity.name}
                error={Boolean(nameError)}
                aria-describedby="assistant-name-hint"
                aria-label={COPY.nameLabel}
              />
              <p id="assistant-name-hint" className="text-xs text-muted-foreground">
                {COPY.nameHint}
              </p>
            </div>

            <fieldset className="space-y-2.5 border-t border-border/50 pt-4">
              <legend className="block text-[13px] font-medium text-foreground/80">
                {COPY.voiceLabel}
              </legend>
              <div className="grid grid-cols-2 gap-2">
                {ASSISTANT_VOICES.map((voice) => (
                  <label
                    key={voice}
                    className={cn(
                      'flex h-11 cursor-pointer items-center justify-center rounded-xl border text-sm font-bold transition-safe duration-200 ease-out',
                      'focus-within:ring-2 focus-within:ring-primary/30',
                      voiceValue === voice
                        ? 'border-primary/50 bg-primary/10 text-primary'
                        : 'border-border/60 bg-background text-foreground hover:border-primary/30 hover:bg-primary/5'
                    )}
                  >
                    <input
                      type="radio"
                      name="assistant-voice"
                      value={voice}
                      checked={voiceValue === voice}
                      onChange={() => setVoiceValue(voice)}
                      className="sr-only"
                    />
                    {VOICE_LABELS[voice]}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{COPY.voiceHint}</p>
            </fieldset>

            {nameError && (
              <p className="text-xs font-medium text-destructive" role="alert">
                {nameError}
              </p>
            )}

            <DialogActions onCancel={closeNameDialog} cancelLabel={COPY.cancel}>
              <HeroCtaButton type="submit" disabled={savingName} className="w-full sm:w-auto">
                {savingName ? (
                  <>
                    <Loader2 className="size-4 animate-spin shrink-0" aria-hidden="true" />
                    <span aria-live="polite">{COPY.saving}</span>
                  </>
                ) : (
                  COPY.save
                )}
              </HeroCtaButton>
            </DialogActions>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={avatarDialogOpen} onOpenChange={setAvatarDialogOpen}>
        <DialogContent
          hideClose
          aria-describedby={undefined}
          className={cn(dialogClassName, 'gap-0')}
        >
          <DialogTitle className="sr-only">{COPY.avatarTitle}</DialogTitle>

          <div className="flex flex-col items-center gap-3 py-2">
            <span className="relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border border-primary/20 bg-primary/10 p-[3px]">
              <AssistantOrb className="size-full" />
              {showAvatar && (
                <Image
                  src={identity.avatarUrl!}
                  alt=""
                  width={112}
                  height={112}
                  unoptimized
                  onError={() => setImageFailed(true)}
                  className="absolute inset-0 size-full object-cover"
                />
              )}
              {uploadingAvatar && (
                <span className="absolute inset-0 flex items-center justify-center bg-background/70">
                  <Loader2 className="size-6 animate-spin text-primary" aria-hidden="true" />
                </span>
              )}
            </span>
            <p className="text-xs text-muted-foreground">{COPY.imageLimit}</p>
          </div>

          <DialogActions
            onCancel={() => setAvatarDialogOpen(false)}
            cancelLabel={COPY.cancel}
            secondary={
              showAvatar ? (
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setConfirmDeleteOpen(true)}
                  disabled={removingAvatar || uploadingAvatar}
                  className="w-full sm:w-auto h-13 sm:h-14 rounded-xl px-5 text-[14px] font-medium text-destructive hover:bg-destructive/10 hover:text-destructive transition-safe duration-300"
                >
                  {removingAvatar ? (
                    <>
                      <Loader2 className="size-4 animate-spin shrink-0" aria-hidden="true" />
                      <span aria-live="polite">{COPY.removing}</span>
                    </>
                  ) : (
                    <>
                      <Trash2 className="size-4" aria-hidden="true" />
                      <span>{COPY.removeAvatar}</span>
                    </>
                  )}
                </Button>
              ) : undefined
            }
          >
            <HeroCtaButton
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadingAvatar || removingAvatar}
              className="w-full sm:w-auto"
            >
              {uploadingAvatar ? (
                <>
                  <Loader2 className="size-4 animate-spin shrink-0" aria-hidden="true" />
                  <span aria-live="polite">{COPY.uploading}</span>
                </>
              ) : showAvatar ? (
                COPY.changeAvatar
              ) : (
                COPY.uploadAvatar
              )}
            </HeroCtaButton>
          </DialogActions>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmDeleteOpen}
        title={COPY.removeAvatar}
        message={COPY.removeMessage}
        confirmLabel={COPY.confirmDelete}
        cancelLabel={COPY.cancel}
        variant="danger"
        isConfirming={removingAvatar}
        onConfirm={handleRemoveAvatar}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </div>
  );
}

function HomeRow({
  href,
  icon: Icon,
  title,
  body,
}: {
  href: string;
  icon: typeof Brain;
  title: string;
  body: string;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'group flex items-start gap-3 rounded-2xl border border-border/50 bg-card/60 px-4 py-3.5',
        'text-start transition-safe duration-150 ease-out hover:border-primary/30 hover:bg-primary/10',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/30'
      )}
    >
      <Icon aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span className="min-w-0 space-y-1">
        <span className="block truncate text-sm font-bold text-foreground sm:text-base">
          {title}
        </span>
        <span className="block text-xs text-muted-foreground">{body}</span>
      </span>
    </Link>
  );
}

function HomeSkeleton() {
  return (
    <div className="space-y-6" aria-busy="true" aria-label={COPY.loading}>
      <div className="h-60 rounded-3xl border border-border/40 bg-muted/40 animate-pulse" />
      <div className="h-36 rounded-2xl border border-border/40 bg-muted/40 animate-pulse" />
      <div className="h-16 rounded-2xl border border-border/40 bg-muted/40 animate-pulse" />
      <div className="h-16 rounded-2xl border border-border/40 bg-muted/40 animate-pulse" />
    </div>
  );
}
