-- Fix remaining slug with Arabic comma (post a0f34fdc)
-- Previous migration didn't catch this due to read replica lag
UPDATE public.posts 
SET slug = 'تخيَّل-أن-تدفع-آلاف-الدُّولارات-لبناء-تطبيق-ثمَّ-تكتشف-أنَّه-غير-قابل-للتَّطوير',
    updated_at = NOW()
WHERE id = 'a0f34fdc-ab7b-49fb-8db6-22272332e9ee'
  AND slug LIKE '%،%';

-- Fix broken cover_image URL with trailing parenthesis
UPDATE public.posts 
SET cover_image = 'https://ievboaylytxgtijconak.supabase.co/storage/v1/object/public/post-images/977f6065-c4f5-4020-b81c-b3e56cb2c052/7a4f51fe-650c-4104-8125-42b6448d2cbe.jpg',
    updated_at = NOW()
WHERE id = 'a0f34fdc-ab7b-49fb-8db6-22272332e9ee'
  AND cover_image LIKE '%)';
