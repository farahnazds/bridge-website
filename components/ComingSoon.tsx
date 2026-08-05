// Shared placeholder for site-mapped sections not built yet (see
// docs/03-site-map.md). Keeps every nav link routable — no 404s — while
// each section waits on its real build. Used across dashboards (Club
// Manager, Club Practitioner, ...).
export default function ComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1
          className="text-2xl font-semibold"
          style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}
        >
          {title}
        </h1>
        <p className="mt-1 text-sm" style={{ color: "var(--text-muted)" }}>
          {description}
        </p>
      </div>

      <div
        className="rounded-xl border p-10 text-center"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
      >
        <p style={{ color: "var(--text-muted)" }}>This section is coming soon.</p>
      </div>
    </div>
  );
}
