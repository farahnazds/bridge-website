"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import { createComment, deleteComment, toggleReflection, type ActionState } from "./actions";

const initialState: ActionState = { error: null };

const inputClass =
  "rounded-lg border px-3.5 py-2.5 text-sm outline-none transition-colors duration-150 focus:border-transparent focus:ring-2 focus:ring-[color:var(--brand-blue)]";
const inputStyle = { borderColor: "var(--border)", backgroundColor: "var(--surface)", color: "var(--text)" };
const labelClass = "text-sm font-medium";

interface Athlete {
  id: string;
  firstName: string;
  lastName: string;
  code: string;
}

export interface CommentRecord {
  id: string;
  authorId: string;
  authorName: string;
  commentType: "private_note" | "official_comment";
  body: string;
  reflectInAi: boolean;
  aiReflectionDisabledBy: string | null;
  targetLabel: string;
  createdAt: string;
  isOwn: boolean;
  canToggleOff: boolean;
}

function ErrorBanner({ error }: { error: string | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="rounded-lg border px-4 py-3 text-sm"
      style={{
        borderColor: "var(--danger)",
        color: "var(--danger)",
        backgroundColor: "color-mix(in srgb, var(--danger) 8%, transparent)",
      }}
    >
      {error}
    </p>
  );
}

function SubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition-[opacity,transform] duration-200 ease-out hover:opacity-90 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-60"
      style={{ backgroundImage: "var(--brand-gradient)" }}
    >
      {pending ? pendingLabel : label}
    </button>
  );
}

function NewCommentForm({
  teamId,
  teamName,
  athletes,
  onDone,
}: {
  teamId: string;
  teamName: string;
  athletes: Athlete[];
  onDone: () => void;
}) {
  const [state, formAction] = useActionState(createComment, initialState);
  const [commentType, setCommentType] = useState<"private_note" | "official_comment">("private_note");

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-lg border p-4" style={{ borderColor: "var(--border)" }} noValidate>
      <input type="hidden" name="team_id" value={teamId} />
      <ErrorBanner error={state.error} />

      <div className="grid grid-cols-2 gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="target" className={labelClass} style={{ color: "var(--text)" }}>
            About
          </label>
          <select id="target" name="target" required defaultValue="team" className={inputClass} style={inputStyle}>
            <option value="team">{teamName} (team-wide)</option>
            {athletes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.firstName} {a.lastName} ({a.code})
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className={labelClass} style={{ color: "var(--text)" }}>
            Type
          </label>
          <div className="flex items-center gap-4 pt-2">
            <label className="flex items-center gap-1.5 text-sm" style={{ color: "var(--text)" }}>
              <input
                type="radio"
                name="comment_type"
                value="private_note"
                checked={commentType === "private_note"}
                onChange={() => setCommentType("private_note")}
              />
              Private Note
            </label>
            <label className="flex items-center gap-1.5 text-sm" style={{ color: "var(--text)" }}>
              <input
                type="radio"
                name="comment_type"
                value="official_comment"
                checked={commentType === "official_comment"}
                onChange={() => setCommentType("official_comment")}
              />
              Official Comment
            </label>
          </div>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="body" className={labelClass} style={{ color: "var(--text)" }}>
          {commentType === "private_note" ? "Visible only to you" : "Visible to everyone with access to this athlete/team"}
        </label>
        <textarea id="body" name="body" rows={3} required className={inputClass} style={inputStyle} />
      </div>

      {commentType === "official_comment" && (
        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--text)" }}>
          <input type="checkbox" name="reflect_in_ai" />
          Reflect in AI reports
        </label>
      )}

      <div className="flex gap-2">
        <SubmitButton label="Post" pendingLabel="Posting…" />
        <button type="button" onClick={onDone} className="rounded-lg px-4 py-2.5 text-sm font-medium" style={{ color: "var(--text-muted)" }}>
          Cancel
        </button>
      </div>
    </form>
  );
}

function DeleteButton({ teamId, commentId }: { teamId: string; commentId: string }) {
  const [state, formAction] = useActionState(deleteComment, initialState);
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="team_id" value={teamId} />
      <input type="hidden" name="comment_id" value={commentId} />
      <button type="submit" className="text-xs font-medium underline-offset-2 hover:underline" style={{ color: "var(--danger)" }}>
        Delete
      </button>
      {state.error && <span className="text-xs" style={{ color: "var(--danger)" }}>{state.error}</span>}
    </form>
  );
}

function ToggleReflectionButton({ teamId, commentId }: { teamId: string; commentId: string }) {
  const [state, formAction] = useActionState(toggleReflection, initialState);
  return (
    <form action={formAction} className="inline-flex items-center gap-2">
      <input type="hidden" name="team_id" value={teamId} />
      <input type="hidden" name="comment_id" value={commentId} />
      <button type="submit" className="text-xs font-medium underline-offset-2 hover:underline" style={{ color: "var(--brand-blue)" }}>
        Turn off AI reflection
      </button>
      {state.error && <span className="text-xs" style={{ color: "var(--danger)" }}>{state.error}</span>}
    </form>
  );
}

function CommentRow({ teamId, comment }: { teamId: string; comment: CommentRecord }) {
  const isOfficial = comment.commentType === "official_comment";
  return (
    <div className="border-b py-4 last:border-b-0" style={{ borderColor: "var(--border)" }}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs">
          <span
            className="rounded-full px-2.5 py-0.5 font-medium"
            style={{
              backgroundColor: isOfficial
                ? "color-mix(in srgb, var(--brand-blue) 12%, transparent)"
                : "color-mix(in srgb, var(--text-muted) 15%, transparent)",
              color: isOfficial ? "var(--brand-blue)" : "var(--text-muted)",
            }}
          >
            {isOfficial ? "Official Comment" : "Private Note"}
          </span>
          <span style={{ color: "var(--text-muted)" }}>{comment.targetLabel}</span>
        </div>
        <span className="text-xs" style={{ color: "var(--text-muted)" }}>
          {comment.authorName} ·{" "}
          {new Date(comment.createdAt).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
        </span>
      </div>

      <p className="mt-2 text-sm" style={{ color: "var(--text)" }}>
        {comment.body}
      </p>

      <div className="mt-2 flex items-center gap-3">
        {isOfficial && (
          <span className="text-xs" style={{ color: comment.reflectInAi ? "var(--success)" : "var(--text-muted)" }}>
            {comment.reflectInAi
              ? "Reflects in AI reports"
              : comment.aiReflectionDisabledBy
                ? "AI reflection turned off by Club Manager"
                : "Not marked for AI reflection"}
          </span>
        )}
        {comment.canToggleOff && <ToggleReflectionButton teamId={teamId} commentId={comment.id} />}
        {comment.isOwn && <DeleteButton teamId={teamId} commentId={comment.id} />}
      </div>
    </div>
  );
}

export default function CommentsClient({
  teamId,
  teamName,
  athletes,
  comments,
}: {
  teamId: string;
  teamName: string;
  athletes: Athlete[];
  comments: CommentRecord[];
}) {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-semibold" style={{ fontFamily: "var(--font-heading)", color: "var(--text)" }}>
          Comments
        </h2>
        {!showForm && (
          <button
            type="button"
            onClick={() => setShowForm(true)}
            className="rounded-lg px-4 py-2 text-sm font-semibold text-white transition-opacity duration-200 hover:opacity-90"
            style={{ backgroundImage: "var(--brand-gradient)" }}
          >
            + New Comment
          </button>
        )}
      </div>

      {showForm && (
        <NewCommentForm teamId={teamId} teamName={teamName} athletes={athletes} onDone={() => setShowForm(false)} />
      )}

      {comments.length === 0 ? (
        <div className="rounded-xl border p-10 text-center" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          <p style={{ color: "var(--text-muted)" }}>No comments yet.</p>
        </div>
      ) : (
        <div className="rounded-xl border px-6" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
          {comments.map((c) => (
            <CommentRow key={c.id} teamId={teamId} comment={c} />
          ))}
        </div>
      )}
    </div>
  );
}
