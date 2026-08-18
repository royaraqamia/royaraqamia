-- LinkSnap: password-protected short links.
--
-- Optional scrypt hash of the link's access password. NULL means the link is
-- publicly accessible. The existing short_links RLS governs the new column.
ALTER TABLE public.short_links
  ADD COLUMN password_hash text;
