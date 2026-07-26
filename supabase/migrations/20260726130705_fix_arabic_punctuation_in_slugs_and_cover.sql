-- Remove Arabic punctuation from slugs (،؛؟ـ٪٫٬٭۔) that fall within \u0600–\u06FF
UPDATE public.posts
SET slug = TRIM(BOTH '-' FROM regexp_replace(
    regexp_replace(LOWER(slug), '[،؛؟ـ٪٫٬٭۔]', '', 'g'),
    '-+', '-', 'g'
  )),
  updated_at = NOW()
WHERE slug ~ '[،؛؟ـ٪٫٬٭۔]';

-- Fix broken cover_image URL with trailing parenthesis
UPDATE public.posts
SET cover_image = regexp_replace(cover_image, '\)$', '', 'g'),
  updated_at = NOW()
WHERE cover_image ~ '\)$';
