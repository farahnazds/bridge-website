-- ============================================================================
-- Admin: scoped access to product_requests
-- ============================================================================
-- The last gap of the same family as migration 008. product_requests has
-- policies for super_admin, club staff (is_club_staff_for_club) and the
-- athlete's own rows — but never one for admin, so an Admin read returned
-- zero rows even for their own assigned clubs. docs/03-site-map.md lists
-- "Product Requests (in-person purchase tracking, all clubs)" under Super
-- Admin, and Admin mirrors that structure scoped to assigned clubs.
--
-- Failed closed, so nothing leaked — but the Admin Product Requests page
-- could not be built until this existed.
--
-- `for all` rather than select-only, matching the shape of the existing
-- "club staff manages own club requests" policy on this same table and the
-- role cascade in docs/02-roles-and-permissions.md ("Everything a Club
-- Manager can do → Admin can do, within clubs assigned to them"). Marking a
-- request fulfilled/paid is the operational action this table exists for.
-- The Admin page ships read-only for now; the policy simply doesn't block a
-- fulfilment action being added later without another migration.
-- ============================================================================

create policy "admin scoped access" on product_requests for all
  using (club_id is not null and is_admin_for_club(club_id));
