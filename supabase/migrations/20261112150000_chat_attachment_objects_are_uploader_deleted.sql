-- ============================================================
-- An attachment object is deleted by its uploader (#887, ADR-0113)
--
-- `20261105090000_chat_attachments_bucket.sql` gave the storage delete policy a
-- membership predicate. Its name said uploaders, but any active member of a
-- thread could remove another member's file: the `chat_attachments` row stayed
-- (that policy is uploader-only), so the peer's message kept pointing at an
-- object that can never be signed again — silent data loss that only shows when
-- the file is opened.
--
-- `storage.objects.owner` is populated on an authenticated upload in this
-- project — the avatar and post-image delete policies already use it — so it is
-- the predicate: the uploader removes their own file, and nobody else does.
--
--   * The failed-send cleanup (`removeChatAttachmentObjects`) removes an object
--     before any `chat_attachments` row exists. The uploader is still its owner,
--     so the corrected policy keeps that path working.
--   * An uploader who has since left the thread can still remove their own
--     object, exactly as they can still remove their own row: what goes is
--     theirs, and a tombstone is the one writer that reaches both halves.
--   * The daily sweep (`backend/services/chat/chat-attachment-sweep.ts`) runs on
--     the service role, which bypasses row level security, so it is unaffected.
--
-- The bucket, its 25 MB limit, the read policy and the insert policy are
-- unchanged.
--
-- Rollback:
--   drop policy if exists "Uploaders delete chat attachments" on storage.objects;
--   create policy "Uploaders delete chat attachments"
--     on storage.objects for delete
--     to authenticated
--     using (
--       bucket_id = 'chat-attachments'
--       and private.chat_is_participant(
--         private.chat_attachment_conversation(name),
--         (select auth.uid())
--       )
--     );
-- ============================================================

drop policy if exists "Uploaders delete chat attachments" on storage.objects;

create policy "Uploaders delete chat attachments"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chat-attachments'
    and owner = (select auth.uid())
  );
