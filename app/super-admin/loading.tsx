import PageSkeleton from "@/components/PageSkeleton";

// Covers every route under /super-admin, including
// /super-admin/clubs/[clubId] — the navigation this was reported against.
// See components/PageSkeleton.tsx for why it exists.
export default function SuperAdminLoading() {
  return <PageSkeleton />;
}
