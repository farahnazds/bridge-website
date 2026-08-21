"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell } from "lucide-react";
import { markAllNotificationsRead, markNotificationsRead } from "@/app/actions/notifications";
import type { NotificationItem, NotificationSummary } from "@/lib/notifications";

// The header bell — staff surface only for now (rendered from the staff team
// layout via DashboardHeader's children slot, the slot that comment reserved
// for "a future header-level control").
//
// Freshness model: server-rendered initial state, then a 60-second poll of
// /api/notifications. Polling one count is deliberate — the app has zero
// realtime infrastructure (no Supabase Realtime subscriptions anywhere), and
// the case this bell exists for is "your report finished generating while you
// were on another page", which a minute's latency serves fine. The poll stops
// on a 401 so a signed-out tab doesn't hammer the API forever.

const POLL_MS = 60_000;

/** Where a notification points, given the team the viewer is inside. */
function hrefFor(teamId: string, n: NotificationItem): string | null {
  switch (n.type) {
    case "report_ready":
    case "report_shared":
      // ?focus deep-links to the specific report: History scrolls that card
      // into view, and its unread highlight marks it — the destination says
      // "here is YOUR report" instead of presenting the whole grid.
      return `/staff/${teamId}/reports/history${
        n.related_id ? `?focus=${encodeURIComponent(n.related_id)}` : ""
      }`;
    case "report_generation_failed":
      return `/staff/${teamId}/reports/generate`;
    case "compliance_missed_days":
    case "compliance_skip_limit":
      return `/staff/${teamId}/compliance`;
    case "message_received":
      return `/staff/${teamId}/messenger`;
    default:
      return null;
  }
}

function relativeTime(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export default function NotificationBell({
  teamId,
  initialSummary,
}: {
  teamId: string;
  initialSummary: NotificationSummary;
}) {
  const router = useRouter();
  const [summary, setSummary] = useState<NotificationSummary>(initialSummary);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const stoppedRef = useRef(false);

  const refresh = useCallback(async () => {
    if (stoppedRef.current) return;
    try {
      const res = await fetch("/api/notifications", { cache: "no-store" });
      if (res.status === 401) {
        stoppedRef.current = true;
        return;
      }
      if (res.ok) setSummary((await res.json()) as NotificationSummary);
    } catch {
      // Transient network failure — keep the last known state and let the
      // next tick retry.
    }
  }, []);

  useEffect(() => {
    const t = setInterval(refresh, POLL_MS);
    return () => clearInterval(t);
  }, [refresh]);

  // Close on any click outside the bell or its panel.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const onItemClick = (n: NotificationItem) => {
    setOpen(false);
    // Optimistic: the row reads as seen immediately; the server catches up.
    setSummary((s) => ({
      unread: n.is_read ? s.unread : Math.max(0, s.unread - 1),
      items: s.items.map((i) => (i.id === n.id ? { ...i, is_read: true } : i)),
    }));
    // Navigate FIRST, mark-read fire-and-forget. This used to await the
    // server action before pushing, which put a full roundtrip of dead air
    // between the click and any visible response — live-measured at several
    // seconds on production, long enough to read as "nothing happened"
    // (reported 2026-08-21). The optimistic update above already handles the
    // local read state; the action needs no ordering relative to the push.
    const href = hrefFor(teamId, n);
    if (href) router.push(href);
    void markNotificationsRead([n.id]);
  };

  const onMarkAll = async () => {
    setSummary((s) => ({ unread: 0, items: s.items.map((i) => ({ ...i, is_read: true })) }));
    await markAllNotificationsRead();
  };

  return (
    <div ref={rootRef} style={{ position: "relative", flex: "none" }}>
      <button
        type="button"
        aria-label={summary.unread > 0 ? `Notifications, ${summary.unread} unread` : "Notifications"}
        aria-expanded={open}
        onClick={() => {
          setOpen((v) => !v);
          if (!open) void refresh();
        }}
        style={{
          position: "relative",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 34,
          height: 34,
          borderRadius: 10,
          border: "1px solid var(--border)",
          backgroundColor: "var(--surface-raised)",
          color: "var(--text-muted)",
          cursor: "pointer",
        }}
      >
        <Bell size={16} aria-hidden />
        {summary.unread > 0 && (
          <span
            style={{
              position: "absolute",
              top: -5,
              right: -5,
              minWidth: 16,
              height: 16,
              padding: "0 4px",
              borderRadius: 8,
              backgroundColor: "var(--brand-teal)",
              color: "#04122B",
              fontFamily: "var(--font-mono)",
              fontSize: 9.5,
              fontWeight: 700,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {summary.unread > 9 ? "9+" : summary.unread}
          </span>
        )}
      </button>

      {open && (
        <div
          role="menu"
          style={{
            position: "absolute",
            right: 0,
            top: "calc(100% + 8px)",
            width: 340,
            maxHeight: 420,
            overflowY: "auto",
            zIndex: 50,
            borderRadius: 12,
            border: "1px solid var(--border)",
            backgroundColor: "var(--surface)",
            boxShadow: "0 12px 32px rgba(0,0,0,.45)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "10px 14px",
              borderBottom: "1px solid var(--border)",
            }}
          >
            <span
              style={{
                fontFamily: "var(--font-mono)",
                fontSize: 9.5,
                letterSpacing: ".14em",
                textTransform: "uppercase",
                color: "var(--text-muted)",
              }}
            >
              Notifications
            </span>
            {summary.unread > 0 && (
              <button
                type="button"
                onClick={onMarkAll}
                style={{
                  fontSize: 11,
                  color: "var(--brand-teal)",
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  padding: 0,
                }}
              >
                Mark all read
              </button>
            )}
          </div>

          {summary.items.length === 0 ? (
            <p style={{ padding: "18px 14px", fontSize: 12.5, color: "var(--text-muted)" }}>
              Nothing yet. Report and sharing updates will land here.
            </p>
          ) : (
            summary.items.map((n) => (
              <button
                key={n.id}
                type="button"
                aria-label={n.title}
                onClick={() => onItemClick(n)}
                // Hover/focus affordance via classes — inline styles can't
                // express :hover, which is why these rows shipped reading as
                // static text (reported 2026-08-21). Background must live in
                // classes too: an inline `background` would outrank hover:*.
                className="bg-transparent transition-colors duration-150 hover:bg-white/5 focus-visible:bg-white/5"
                style={{
                  display: "flex",
                  gap: 10,
                  width: "100%",
                  textAlign: "left",
                  padding: "11px 14px",
                  border: "none",
                  borderBottom: "1px solid var(--border)",
                  cursor: "pointer",
                }}
              >
                <span
                  aria-hidden
                  style={{
                    marginTop: 5,
                    width: 7,
                    height: 7,
                    flex: "none",
                    borderRadius: "50%",
                    backgroundColor: n.is_read
                      ? "transparent"
                      : n.type === "report_generation_failed"
                        ? "var(--danger)"
                        : "var(--brand-teal)",
                    border: n.is_read ? "1px solid var(--border)" : "none",
                  }}
                />
                <span style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 0 }}>
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: n.is_read ? 400 : 600,
                      color: "var(--text)",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {n.title}
                  </span>
                  {n.body && (
                    <span
                      style={{
                        fontSize: 11.5,
                        color: "var(--text-muted)",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {n.body}
                    </span>
                  )}
                  <span style={{ fontSize: 10.5, color: "var(--text-muted)" }}>
                    {relativeTime(n.created_at)}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
