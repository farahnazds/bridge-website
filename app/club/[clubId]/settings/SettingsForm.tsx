"use client";

import { useActionState } from "react";
import { BTN_PRIMARY, CARD, INPUT, INPUT_STYLE, NOTICE } from "@/lib/ui";
import { useFormStatus } from "react-dom";
import { saveClubSettings, type SettingsState } from "./actions";

export interface StaffOption {
  id: string;
  name: string;
  specialty: string | null;
  isManager: boolean;
}

const initialState: SettingsState = { error: null, saved: false };


function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className={`w-fit ${BTN_PRIMARY}`}
      style={{ backgroundImage: "var(--brand-gradient)" }}
    >
      {pending ? "Saving…" : "Save settings"}
    </button>
  );
}

export default function SettingsForm({
  clubId,
  notifyDays,
  skipLimit,
  language,
  staff,
  selectedIds,
}: {
  clubId: string;
  notifyDays: number;
  skipLimit: number;
  language: string;
  staff: StaffOption[];
  selectedIds: string[];
}) {
  const [state, formAction] = useActionState(saveClubSettings, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-6">
      <input type="hidden" name="club_id" value={clubId} />

      <div
        className={`flex flex-col gap-5 ${CARD} p-5`}
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
      >
        <div>
          <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Compliance notifications
          </h2>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            When an athlete stops checking in, these decide how quickly your club hears about it.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="compliance_notify_days" className="text-sm font-medium" style={{ color: "var(--text)" }}>
              Days before notifying
            </label>
            <input
              id="compliance_notify_days"
              name="compliance_notify_days"
              type="number"
              min={1}
              max={7}
              required
              defaultValue={notifyDays}
              className={INPUT}
              style={INPUT_STYLE}
            />
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Consecutive missed days before an alert is raised (1–7).
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="monthly_skip_limit" className="text-sm font-medium" style={{ color: "var(--text)" }}>
              Monthly skip limit
            </label>
            <input
              id="monthly_skip_limit"
              name="monthly_skip_limit"
              type="number"
              min={1}
              max={15}
              required
              defaultValue={skipLimit}
              className={INPUT}
              style={INPUT_STYLE}
            />
            <p className="text-xs" style={{ color: "var(--text-muted)" }}>
              Skips allowed in a calendar month before an alert is raised (1–15).
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium" style={{ color: "var(--text)" }}>
            Who gets notified
          </p>
          <p className="text-xs" style={{ color: "var(--text-muted)" }}>
            This controls alerts only. Any practitioner with access can still see compliance status
            on an athlete&apos;s profile or in reports, whether or not they&apos;re listed here.
          </p>
          <div className="mt-1 flex flex-col gap-2">
            {staff.length === 0 && (
              <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                No practitioners at this club yet.
              </p>
            )}
            {staff.map((s) => (
              <label key={s.id} className="flex items-center gap-2.5 text-sm" style={{ color: "var(--text)" }}>
                <input
                  type="checkbox"
                  name="notify_profile_ids"
                  value={s.id}
                  defaultChecked={selectedIds.includes(s.id)}
                  className="h-4 w-4 rounded"
                  style={{ accentColor: "var(--brand-blue)" }}
                />
                {s.name}
                <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                  {s.isManager ? "Club Manager" : s.specialty ?? "Practitioner"}
                </span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div
        className={`flex flex-col gap-4 ${CARD} p-5`}
        style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
      >
        <div>
          <h2 className="text-sm font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
            Reports
          </h2>
          <p className="mt-1 text-xs" style={{ color: "var(--text-muted)" }}>
            The starting language for generated reports. A practitioner can still override it on any
            individual report.
          </p>
        </div>
        <div className="flex max-w-xs flex-col gap-1.5">
          <label htmlFor="default_report_language" className="text-sm font-medium" style={{ color: "var(--text)" }}>
            Default report language
          </label>
          <select
            id="default_report_language"
            name="default_report_language"
            defaultValue={language}
            className={INPUT}
            style={INPUT_STYLE}
          >
            <option value="english">English</option>
            <option value="arabic">Arabic</option>
          </select>
        </div>
      </div>

      {state.error && (
        <p
          role="alert"
          className={NOTICE}
          style={{
            borderColor: "var(--danger)",
            color: "var(--danger)",
            backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
          }}
        >
          {state.error}
        </p>
      )}
      {state.saved && !state.error && (
        <p
          role="status"
          className={NOTICE}
          style={{
            borderColor: "var(--success)",
            color: "var(--success)",
            backgroundColor: "color-mix(in srgb, var(--success) 8%, transparent)",
          }}
        >
          Settings saved.
        </p>
      )}

      <SubmitButton />
    </form>
  );
}
