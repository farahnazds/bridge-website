"use client";

import { useActionState, useState } from "react";
import { BTN_PRIMARY, CARD, INPUT, INPUT_STYLE, NOTICE, NOTICE_EMPTY } from "@/lib/ui";
import { useFormStatus } from "react-dom";
import { saveSegment, deleteSegment, type SegmentState } from "./actions";
import { SPORTS, OTHER_SPORT } from "@/lib/constants";

export interface Segment {
  id: string;
  name: string;
  city: string | null;
  sport: string | null;
  timezone: string;
  brandCount: number;
}

const initial: SegmentState = { error: null, saved: false };

function Submit({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending}
      className={`w-fit ${BTN_PRIMARY}`}
      style={{ backgroundImage: "var(--brand-gradient-action)" }}>
      {pending ? "Saving…" : label}
    </button>
  );
}

function SegmentForm({ segment, onDone }: { segment?: Segment; onDone?: () => void }) {
  const [state, action] = useActionState(saveSegment, initial);
  const knownSport = SPORTS.includes(segment?.sport ?? "");
  const [sport, setSport] = useState(segment?.sport && !knownSport ? OTHER_SPORT : segment?.sport ?? "");
  if (state.saved && onDone) onDone();

  return (
    <form action={action} className="flex flex-col gap-4">
      {segment && <input type="hidden" name="id" value={segment.id} />}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--text)" }}>Segment name</label>
          <input name="name" required defaultValue={segment?.name ?? ""} placeholder="e.g. UAE Independent Athletes"
            className={INPUT} style={INPUT_STYLE} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--text)" }}>City</label>
          <input name="city" defaultValue={segment?.city ?? ""} className={INPUT} style={INPUT_STYLE} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--text)" }}>Sport</label>
          <select value={sport} onChange={(e) => setSport(e.target.value)}
            name={sport === OTHER_SPORT ? undefined : "sport"} className={INPUT} style={INPUT_STYLE}>
            <option value="">Any sport</option>
            {SPORTS.map((s) => <option key={s} value={s}>{s}</option>)}
            <option value={OTHER_SPORT}>Other…</option>
          </select>
          {sport === OTHER_SPORT && (
            <input name="sport" required placeholder="Sport name" className={`${INPUT} mt-2`} style={INPUT_STYLE} />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--text)" }}>Timezone</label>
          <input name="timezone" required defaultValue={segment?.timezone ?? "Asia/Dubai"}
            className={INPUT} style={INPUT_STYLE} />
        </div>
      </div>

      {state.error && (
        <p role="alert" className={NOTICE}
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>{state.error}</p>
      )}
      <div className="flex items-center gap-3">
        <Submit label={segment ? "Save changes" : "Add segment"} />
        {onDone && (
          <button type="button" onClick={onDone} className="text-sm underline-offset-2 hover:underline"
            style={{ color: "var(--text-muted)" }}>Cancel</button>
        )}
      </div>
    </form>
  );
}

function DeleteSegment({ id }: { id: string }) {
  const [state, action] = useActionState(deleteSegment, initial);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-xs underline-offset-2 hover:underline" style={{ color: "var(--danger)" }}>
        Delete
      </button>
      {state.error && <span className="ml-2 text-xs" style={{ color: "var(--danger)" }}>{state.error}</span>}
    </form>
  );
}

export default function SegmentsClient({ segments, canWrite }: { segments: Segment[]; canWrite: boolean }) {
  const [editingId, setEditingId] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-6">
      {canWrite && (
        <div className={`flex flex-col gap-4 ${CARD} p-5`}
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Add a segment
          </h2>
          <SegmentForm />
        </div>
      )}

      {segments.length === 0 ? (
        <p className={NOTICE_EMPTY}
          style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
          No segments yet. Athletes with no club need one to receive a prescription brand.
        </p>
      ) : (
        <div className={`overflow-hidden ${CARD}`}
          style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          {segments.map((s, i) => (
            <div key={s.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
              {editingId === s.id ? (
                <div className="p-5"><SegmentForm segment={s} onDone={() => setEditingId(null)} /></div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3 p-5">
                  <div className="min-w-0">
                    <p className="text-sm font-medium" style={{ color: "var(--text)" }}>{s.name}</p>
                    <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                      {[s.city, s.sport ?? "Any sport", s.timezone].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <div className="flex flex-shrink-0 items-center gap-4">
                    <span className="text-xs" style={{ color: s.brandCount > 0 ? "var(--text)" : "var(--text-muted)" }}>
                      {s.brandCount} brand{s.brandCount === 1 ? "" : "s"}
                    </span>
                    {canWrite && (
                      <div className="flex items-center gap-3">
                        <button type="button" onClick={() => setEditingId(s.id)}
                          className="text-xs underline-offset-2 hover:underline" style={{ color: "var(--brand-blue)" }}>
                          Edit
                        </button>
                        <DeleteSegment id={s.id} />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
