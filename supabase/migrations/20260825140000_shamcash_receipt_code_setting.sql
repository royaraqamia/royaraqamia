-- ShamCash payments use a transfer receipt code pasted inside the app,
-- replacing the earlier QR-image approach.
--
-- Rollback note: delete the 'payment_shamcash_code' row and re-insert
-- ('payment_shamcash_qr_path', '/images/payments/shamcash-qr-placeholder.png');

insert into public.consultation_settings (key, value)
values ('payment_shamcash_code', '9134c265f2d8e9222cab3a9874071209')
on conflict (key) do update set value = excluded.value, updated_at = now();

delete from public.consultation_settings where key = 'payment_shamcash_qr_path';
