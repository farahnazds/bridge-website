-- 048: index for the header notification bell (2026-08-21).
--
-- The staff layout now renders an unread count on every page load, and the
-- bell polls the same query every 60 seconds per open tab. notifications had
-- no index beyond its primary key, so each of those was a sequential scan —
-- fine at pilot row counts, quietly worsening forever after.
--
-- Shape matches the two queries in lib/notifications.ts exactly:
--   unread count:  WHERE profile_id = ? AND is_read = false
--   recent list:   WHERE profile_id = ? ORDER BY created_at DESC LIMIT 10
--
-- No RLS change anywhere in this feature: report_ready/report_generation_failed
-- rows are self-inserts under the existing "own notifications" policy.

create index if not exists notifications_profile_read_created_idx
  on public.notifications (profile_id, is_read, created_at desc);
