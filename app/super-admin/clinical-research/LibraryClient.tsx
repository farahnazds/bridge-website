"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createEntry, updateEntry, deleteEntry, type LibraryState } from "./actions";
import { CLINICAL_TOPIC_TAGS } from "@/lib/constants";

export interface LibraryEntry {
  id: string;
  topic_tag: string;
  year: number | null;
  title: string;
  source: string | null;
  clinical_note: string | null;
}

const initial: LibraryState = { error: null, saved: false };
const inputClass =
  "rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-transparent focus:ring-2 focus:ring-[color:var(--brand-blue)]";
const inputStyle = { borderColor: "var(--border)", backgroundColor: "var(--surface)", color: "var(--text)" };
const TAG_LABEL: Record<string, string> = Object.fromEntries(
  CLINICAL_TOPIC_TAGS.map((t) => [t.value, t.label])
);

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-fit rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-opacity duration-200 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
      style={{ backgroundImage: "var(--brand-gradient)" }}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function EntryFields({ entry }: { entry?: LibraryEntry }) {
  return (
    <>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--text)" }}>
            Topic
          </label>
          {/* A fixed select, never free text: each value is queried verbatim by
              a report generator, so a typo would make the entry invisible to
              every report with no error shown anywhere. */}
          <select name="topic_tag" defaultValue={entry?.topic_tag ?? "compliance"} className={inputClass} style={inputStyle}>
            {CLINICAL_TOPIC_TAGS.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--text)" }}>
            Year
          </label>
          <input name="year" type="number" min={1900} max={new Date().getFullYear() + 1}
            defaultValue={entry?.year ?? ""} placeholder="2019" className={inputClass} style={inputStyle} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label className="text-sm font-medium" style={{ color: "var(--text)" }}>
            Source
          </label>
          <input name="source" defaultValue={entry?.source ?? ""} placeholder="Journal of Sports Sciences"
            className={inputClass} style={inputStyle} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" style={{ color: "var(--text)" }}>
          Title
        </label>
        <input name="title" required defaultValue={entry?.title ?? ""}
          placeholder="Protein timing and lean mass retention in adolescent athletes"
          className={inputClass} style={inputStyle} />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-sm font-medium" style={{ color: "var(--text)" }}>
          Clinical note
        </label>
        <textarea name="clinical_note" rows={3} defaultValue={entry?.clinical_note ?? ""}
          placeholder="What this supports, in the terms a report would cite it for."
          className={inputClass} style={inputStyle} />
        <p className="text-xs" style={{ color: "var(--text-muted)" }}>
          The AI reads this to decide whether the entry is relevant to a section.
        </p>
      </div>
    </>
  );
}

function Feedback({ state }: { state: LibraryState }) {
  if (state.error) {
    return (
      <p role="alert" className="rounded-lg border px-4 py-3 text-sm"
        style={{ borderColor: "var(--danger)", color: "var(--danger)", backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)" }}>
        {state.error}
      </p>
    );
  }
  if (state.saved) {
    return (
      <p className="rounded-lg border px-4 py-3 text-sm"
        style={{ borderColor: "var(--success)", color: "var(--success)", backgroundColor: "color-mix(in srgb, var(--success) 8%, transparent)" }}>
        Saved.
      </p>
    );
  }
  return null;
}

function EditRow({ entry, onDone }: { entry: LibraryEntry; onDone: () => void }) {
  const [state, action] = useActionState(updateEntry, initial);
  if (state.saved) onDone();
  return (
    <form action={action} className="flex flex-col gap-4 p-5">
      <input type="hidden" name="id" value={entry.id} />
      <EntryFields entry={entry} />
      <Feedback state={state} />
      <div className="flex items-center gap-3">
        <SubmitButton label="Save changes" pendingLabel="Saving…" />
        <button type="button" onClick={onDone} className="text-sm underline-offset-2 hover:underline"
          style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function DeleteButton({ id }: { id: string }) {
  const [state, action] = useActionState(deleteEntry, initial);
  return (
    <form action={action} className="inline">
      <input type="hidden" name="id" value={id} />
      <button type="submit" className="text-xs underline-offset-2 hover:underline"
        style={{ color: "var(--danger)" }} aria-label="Delete entry">
        Delete
      </button>
      {state.error && (
        <span className="ml-2 text-xs" style={{ color: "var(--danger)" }}>
          {state.error}
        </span>
      )}
    </form>
  );
}

export default function LibraryClient({ entries }: { entries: LibraryEntry[] }) {
  const [addState, addAction] = useActionState(createEntry, initial);
  const [editingId, setEditingId] = useState<string | null>(null);

  const byTag = CLINICAL_TOPIC_TAGS.map((t) => ({
    ...t,
    entries: entries.filter((e) => e.topic_tag === t.value),
  }));

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-4 rounded-xl border p-5"
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
        <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Add an entry
        </h2>
        <form action={addAction} className="flex flex-col gap-4">
          <EntryFields />
          <Feedback state={addState} />
          <SubmitButton label="Add to library" pendingLabel="Adding…" />
        </form>
      </div>

      {/* Grouped by topic so the gaps are visible: a topic with no entries
          means every report of that type generates with no citations. */}
      <div className="flex flex-col gap-5">
        {byTag.map((group) => (
          <div key={group.value} className="flex flex-col gap-2">
            <div className="flex items-baseline gap-2">
              <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
                {group.label}
              </h2>
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                {group.entries.length} {group.entries.length === 1 ? "entry" : "entries"}
              </span>
            </div>

            {group.entries.length === 0 ? (
              <p className="rounded-lg border border-dashed px-4 py-3 text-sm"
                style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}>
                No entries — {group.label} reports will generate with no citations.
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
                {group.entries.map((e, i) => (
                  <div key={e.id} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined }}>
                    {editingId === e.id ? (
                      <EditRow entry={e} onDone={() => setEditingId(null)} />
                    ) : (
                      <div className="flex flex-wrap items-start justify-between gap-3 p-5">
                        <div className="min-w-0">
                          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
                            {e.title}
                          </p>
                          <p className="mt-0.5 text-xs" style={{ color: "var(--text-muted)" }}>
                            {[e.year, e.source].filter(Boolean).join(" · ") || "No year or source recorded"}
                          </p>
                          {e.clinical_note && (
                            <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--text)" }}>
                              {e.clinical_note}
                            </p>
                          )}
                        </div>
                        <div className="flex flex-shrink-0 items-center gap-3">
                          <button type="button" onClick={() => setEditingId(e.id)}
                            className="text-xs underline-offset-2 hover:underline" style={{ color: "var(--brand-blue)" }}>
                            Edit
                          </button>
                          <DeleteButton id={e.id} />
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
