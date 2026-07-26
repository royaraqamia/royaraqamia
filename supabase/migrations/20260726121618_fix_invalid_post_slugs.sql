-- Clean up slugs that contain spaces, special characters, or Arabic punctuation
-- Must match generateSlug() logic in editor-content.tsx
UPDATE public.posts
SET slug = TRIM(BOTH '-' FROM regexp_replace(
    regexp_replace(
      regexp_replace(LOWER(slug), '[^\w\s\u0600-\u06FF-]', '', 'g'),
      '[\u060C\u061B\u061F\u0640\u066A\u066B\u066C\u066D\u06D4]', '', 'g'
    ),
    '[\s-]+', '-', 'g'
  )),
  updated_at = NOW()
WHERE slug ~ '[^\w\u0600-\u06FF-]' OR slug ~ '\s' OR slug ~ '[\u060C\u061B\u061F\u0640\u066A\u066B\u066C\u066D\u06D4]';
