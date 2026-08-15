-- 046: Intake fields on leads, for the public Book-a-Meeting flow.
--
-- The two-step booking flow (/book -> /book/schedule) captures more context
-- than the leads table's v3 shape held: the visitor's role, country, sport
-- and squad size, per the owner's intake design. Typed columns rather than
-- packing into `notes`, by the owner's ruling — the admin lead pipeline
-- should be able to filter and display these.
--
-- The REQUESTED meeting slot deliberately gets NO new column: the table
-- already carries meeting_date timestamptz + meeting_booked boolean, and the
-- flow uses their combination honestly — meeting_date set with
-- meeting_booked FALSE means "visitor requested this time, not yet
-- confirmed" (the placeholder booking path, until the Google Calendar
-- integration lands in lib/booking.ts and flips meeting_booked true on a
-- real event).
--
-- RLS unchanged: the deliberate "public insert" policy already lets the
-- anonymous intake write, and super admin retains full access. Updates
-- (recording the requested slot) run server-side via the service role in
-- lib/booking.ts — anonymous visitors have, and should have, no UPDATE path.
alter table leads add column if not exists role text;
alter table leads add column if not exists country text;
alter table leads add column if not exists sport text;
alter table leads add column if not exists squad_size text;

comment on column leads.role is 'Self-described role from the intake form (Club Manager / Head Coach / ...).';
comment on column leads.country is 'Country from the intake form.';
comment on column leads.sport is 'Primary sport from the intake form.';
comment on column leads.squad_size is 'Approximate squad size range from the intake form (1-20, 21-50, 51-150, 150+).';

notify pgrst, 'reload schema';
