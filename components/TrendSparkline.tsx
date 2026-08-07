// Small inline trend chart for athlete-facing metric history.
//
// Hand-drawn SVG rather than a charting dependency: these are a dozen points
// at most, and the design system (docs/06-design-system.md) asks for an area
// fill, a faint baseline and an emphasised endpoint rather than a full chart
// chrome. Pure presentation — no hooks — so it renders in server components.

export interface TrendPoint {
  label: string;
  value: number | null;
}

export default function TrendSparkline({
  points,
  color = "var(--brand-blue)",
  height = 46,
  invertGood = false,
}: {
  points: TrendPoint[];
  color?: string;
  height?: number;
  /** true when a FALLING line is the good direction (e.g. body fat %). */
  invertGood?: boolean;
}) {
  const usable = points.filter((p): p is { label: string; value: number } => p.value !== null);
  if (usable.length < 2) {
    return (
      <p className="text-xs" style={{ color: "var(--text-muted)" }}>
        {usable.length === 1 ? "One reading — not enough for a trend yet." : "No readings yet."}
      </p>
    );
  }

  const W = 240;
  const H = height;
  const PAD = 4;
  const values = usable.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => PAD + (i * (W - PAD * 2)) / (usable.length - 1);
  const y = (v: number) => PAD + (1 - (v - min) / span) * (H - PAD * 2);

  const line = usable.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");
  const area = `${line} L${x(usable.length - 1).toFixed(1)},${H - PAD} L${x(0).toFixed(1)},${H - PAD} Z`;

  const first = values[0];
  const last = values[values.length - 1];
  const delta = last - first;
  const improving = invertGood ? delta < 0 : delta > 0;
  const deltaColor = delta === 0 ? "var(--text-muted)" : improving ? "var(--success)" : "var(--warning)";
  const gradientId = `spark-${Math.abs(
    usable.map((p) => p.label + p.value).join("").split("").reduce((a, c) => a + c.charCodeAt(0), 0)
  )}`;

  return (
    <div className="flex flex-col gap-1">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        height={H}
        preserveAspectRatio="none"
        role="img"
        aria-label={`Trend from ${usable[0].label} to ${usable[usable.length - 1].label}: ${first} to ${last}`}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.18" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <line x1="0" y1={H - PAD} x2={W} y2={H - PAD} stroke="var(--border)" strokeWidth="1" />
        <path d={area} fill={`url(#${gradientId})`} />
        <path d={line} fill="none" stroke={color} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(usable.length - 1)} cy={y(last)} r="3" fill={color} />
      </svg>
      <div className="flex items-baseline justify-between text-xs" style={{ color: "var(--text-muted)" }}>
        <span>{usable[0].label}</span>
        <span style={{ color: deltaColor, fontVariantNumeric: "tabular-nums" }}>
          {delta > 0 ? "+" : ""}
          {Number(delta.toFixed(1))} over {usable.length} readings
        </span>
        <span>{usable[usable.length - 1].label}</span>
      </div>
    </div>
  );
}
