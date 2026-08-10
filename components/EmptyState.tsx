import { CARD } from "@/lib/ui";
// Shared empty/zero-data panel. Same visual shape already used inline
// across the club and staff dashboards — extracted here now that the Admin
// pages need it in five more places.
export default function EmptyState({ message }: { message: string }) {
  return (
    <div
      className={`${CARD} p-10 text-center`}
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
    >
      <p style={{ color: "var(--text-muted)" }}>{message}</p>
    </div>
  );
}
