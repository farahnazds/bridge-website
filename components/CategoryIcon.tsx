"use client";

import { Droplets, Dumbbell, Zap, Flame, Moon, Pill, Package } from "lucide-react";

// The generic category placeholder (owner ruling 2026-08-29): products with
// no uploaded photo show their docs/13 category's icon in the category's own
// accent token — NEVER a web-pulled product image. No brand's photography is
// licensed for commercial use in a third-party catalogue (checked: no press
// kit, partner program or API grants it), so real photos enter exclusively
// through the editors' upload button once a brand explicitly permits.
//
// Icons are lucide (the app's icon system); tones are the --category-*
// tokens the Supplements agenda already uses, so a category reads as the
// same hue on every surface.

const CATEGORY_ICON: Record<string, { Icon: typeof Droplets; tone: string }> = {
  Hydration: { Icon: Droplets, tone: "var(--category-hydration)" },
  Protein: { Icon: Dumbbell, tone: "var(--category-protein)" },
  Performance: { Icon: Zap, tone: "var(--category-performance)" },
  "Race Fuel": { Icon: Flame, tone: "var(--category-race-fuel)" },
  Recovery: { Icon: Moon, tone: "var(--category-recovery)" },
  Micronutrient: { Icon: Pill, tone: "var(--category-micronutrient)" },
};

export default function CategoryIcon({
  category,
  size = 44,
}: {
  category: string | null;
  size?: number;
}) {
  const { Icon, tone } = (category && CATEGORY_ICON[category]) || { Icon: Package, tone: "var(--text-muted)" };
  return (
    <span
      aria-hidden="true"
      className="flex shrink-0 items-center justify-center rounded-lg border"
      style={{
        width: size,
        height: size,
        borderColor: "var(--border)",
        backgroundColor: `color-mix(in srgb, ${tone} 12%, transparent)`,
        color: tone,
      }}
    >
      <Icon size={Math.round(size * 0.5)} aria-hidden="true" />
    </span>
  );
}
