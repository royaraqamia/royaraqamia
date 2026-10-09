-- ============================================================
-- English (latin) usernames by transliterating Arabic names
--
-- The handle generator kept Arabic letters, so an Arabic display name produced
-- an Arabic handle like `رؤي-ة-رق-مي-ة` — percent-encoded in every profile URL
-- and unpleasant to type or share. Handles are identity, not content, so they
-- now transliterate to latin (the one place the app diverges from its
-- Arabic-friendly content slugs).
--
--   1. `transliterate_arabic` maps Arabic letters to latin (لا→la, ث→th, ع→a,
--      harakat/tatweel dropped). It is approximate by nature — Arabic short
--      vowels are unwritten, so `محمد` yields `mhmd`, not `mohamed`.
--   2. `slugify_username` transliterates first, then keeps only `[a-z0-9-]`.
--   3. `assign_username` falls back to `user-<random>` when nothing latin
--      survives (e.g. a non-Arabic, non-latin name).
--
-- Existing Arabic handles are regenerated below. This treats every current
-- handle as auto-generated, which is safe because the username editor is not
-- deployed yet; only handles containing Arabic letters are touched, so latin
-- handles (auto or hand-picked) are left exactly as they are.
--
-- Rollback: restore the 20261009120000 body of slugify_username/assign_username
-- and drop transliterate_arabic. Regenerated handles are not restored.
-- ============================================================

create or replace function public.transliterate_arabic(raw text)
returns text
language plpgsql
immutable
set search_path = 'public'
as $$
declare
  result text := coalesce(raw, '');
  pair text;
  -- Order matters only for the multi-character lam-alef entries, which must be
  -- consumed before the standalone lam and alef. Everything else is 1:1 and
  -- order-independent. `ء:` intentionally maps to the empty string (drop it).
  pairs text[] := array[
    'لا:la', 'ﻻ:la', 'ﻼ:la',
    'أ:a', 'إ:i', 'آ:a', 'ٱ:a', 'ا:a', 'ى:a', 'ة:a', 'ء:',
    'ب:b', 'ت:t', 'ث:th', 'ج:j', 'ح:h', 'خ:kh',
    'د:d', 'ذ:dh', 'ر:r', 'ز:z', 'س:s', 'ش:sh',
    'ص:s', 'ض:d', 'ط:t', 'ظ:z', 'ع:a', 'غ:gh',
    'ف:f', 'ق:q', 'ك:k', 'ل:l', 'م:m', 'ن:n', 'ه:h',
    'و:w', 'ؤ:w', 'ي:y', 'ئ:y'
  ];
begin
  foreach pair in array pairs loop
    result := replace(result, split_part(pair, ':', 1), split_part(pair, ':', 2));
  end loop;
  return result;
end;
$$;

-- Transliterate, drop harakat/tatweel/superscript-alef, then project to
-- [a-z0-9-] and trim. Latin names are unaffected.
create or replace function public.slugify_username(raw text)
returns text
language sql
immutable
set search_path = 'public'
as $$
  select trim(
    both '-'
    from regexp_replace(
      lower(
        public.transliterate_arabic(
          regexp_replace(coalesce(raw, ''), E'[\u064B-\u0652\u0640\u0670]', '', 'g')
        )
      ),
      '[^a-z0-9]+', '-', 'g'
    )
  )
$$;

create or replace function public.assign_username()
returns trigger
language plpgsql
set search_path = 'public'
as $$
declare
  base text;
  candidate text;
  suffix int := 0;
begin
  if new.username is not null and btrim(new.username) <> '' then
    new.username := lower(btrim(new.username));
    return new;
  end if;

  base := public.slugify_username(new.name);
  if base is null or base = '' then
    base := 'user-' || substr(md5(random()::text), 1, 6);
  end if;
  base := left(base, 30);

  candidate := base;
  loop
    exit when not exists (
      select 1
      from public.users
      where lower(username) = candidate
        and id is distinct from new.id
    );
    suffix := suffix + 1;
    candidate := left(base, 27) || '-' || suffix::text;
  end loop;

  new.username := candidate;
  return new;
end;
$$;

-- Regenerate only handles that still contain Arabic letters. Listing username
-- in the SET fires the BEFORE UPDATE OF username trigger, which recomputes a
-- transliterated (or, if nothing survives, `user-<random>`) handle.
update public.users
set username = null
where username ~ E'[\u0621-\u064A]';
