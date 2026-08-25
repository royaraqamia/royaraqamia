-- The lazy expiry sweep runs server-side through the service-role client.
-- 20260825120000 revoked PUBLIC execute from all consultation functions;
-- this restores the minimum grant needed for the sweep runner.
--
-- Rollback note: revoke execute on function public.expire_stale_consultation_bookings()
-- from service_role;

grant execute on function public.expire_stale_consultation_bookings() to service_role;
