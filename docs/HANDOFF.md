# HANDOFF — where the website work stands

**Written 2026-10-01 (UAE) at the end of a long session. Verified against git,
the live site and the database that day — not from memory.** Read this before
touching anything. If it is more than a few days old, re-verify the git facts
below (`git fetch`, `git log origin/main..origin/dev`) before trusting them.
The matching doc for the iOS app is `bridgetx-mobile/docs/HANDOFF.md`.

Owner: Blessing Mushonga (non-developer). Explain technical terms, say plainly
when something needs doing outside VS Code, and confirm before anything
outward-facing or irreversible.

---

## 1. Hard rules (learned the hard way this session)

- **Do NOT merge `dev` into `main` as a bundle.** `dev` is 20 commits ahead of
  `main` and carries work the owner has NOT approved for production (section 4).
  Anything going live is lifted onto its own small branch cut from `main`, then
  merged by the owner through a pull request.
- **Only ONE Supabase project exists.** Staging (thebridgehp.com, behind Vercel
  login) and production (bridgetx.co) share the same database. Migrations
  applied "for dev" are live for production code too. Any new table/policy is a
  production change.
- **Claude cannot push to `main`** (a hook blocks it) and has no `gh` CLI. The
  flow is: push a branch, hand the owner a prefilled compare link
  (`https://github.com/farahnazds/bridge-website/compare/main...<branch>?expand=1&title=...`),
  the owner clicks Create + Merge. The hook also pattern-matches command TEXT:
  words like "production"/"deploy" near a push can block a harmless command.
- **Never `git pull` on a stale local `main`.** Earlier in this session local
  `main` had 4 unpushed commits (check-in reminders, RTP gate) that would have
  shipped. It was repaired: local `main` == `origin/main` (`478f991`). A
  safety branch `backup/local-main-before-reset-2026-09-30` (at `cd4f84b`)
  still exists; those 4 commits are also on `origin/dev`.
- Shell tooling: long heredocs with apostrophes break the Bash tool — write
  files with the Write tool instead. PowerShell 5.1 mangles `Invoke-WebRequest`
  headers; use `curl.exe`.
- Database writes to the shared DB need explicit owner go-ahead per session;
  use clearly marked test rows (`ZZ-TEST`) and delete them afterwards.
- `next build` under a live `next start` breaks styling; check for a running
  server first.

---

## 2. Live in production (verified 2026-10-01)

`origin/main` = `478f991`.

- **`/support`** — public support form (name, email, message). Emails
  admin@bridgetx.co (reply-to = visitor) and sends the visitor a plain-text
  acknowledgement. Honeypot field + **rate limit** (3 per IP/hour, 30/hour
  overall) in migration **067** (`support_rate_limit_events`,
  `check_support_rate_limit()`, service-role only, hashed IPs, 24h purge).
  Merged as PR #1. `https://www.bridgetx.co/support` returns 200 today.
  - Verified end to end on **staging** (real submit, admin inbox received both
    test emails, 4th submission from one address blocked, honeypot drop).
  - **Not yet confirmed by Claude: a real submission on the production URL.**
    Do one (it counts toward the 3/hour limit; limiter rows live in
    `support_rate_limit_events`, safe to clear).
  - This is the App Store Connect "Support URL".
- **Footer + login links** — the footer has a "Support" link (Connect column)
  and the login page's old `mailto:` "Request access" link is replaced by
  "Need help signing in?" → `/support`. Merged as **PR #2** (`478f991`) and
  **live** (the live `/login` page contains the new text). *An earlier note
  said this was unmerged — that was wrong; it is merged.*
- Partner-consultant hotfix `a256bd1` (page queried columns migration 063
  dropped) is on production.
- Merged branches that can be deleted: `release/support-page`,
  `fix/footer-login-support-links`.

---

## 3. Built but NOT in production — account closure (migration 066)

Athletes can ask to **close (deactivate) their account — never delete data**
(the club/practitioner owns the records). Committed on `dev` (`f153f1e`),
migration 066 is **already applied to the shared DB**.

- DB: `athlete_account_closures` (requested → processed → reversed),
  `request_account_closure()` (athlete-only, idempotent),
  `revoke_user_sessions()` (service role only). See
  `database/rls-policies.md` (066 section).
- Web (dev only): Super Admin processes / declines / reinstates on the athlete
  profile (`app/super-admin/athlete-closures/actions.ts`,
  `components/AccountClosurePanel.tsx`); status shown read-only to club staff /
  practitioners / admins on profile + athlete lists; pending requests on the
  Super Admin dashboard; registering a closed athlete's email shows "account
  closed at their own request, contact Bridgetx".
- Processing = Supabase Auth ban (`ban_duration` 876000h) + session deletion +
  push tokens disabled. Verified live with a marked test athlete (17/17):
  banned sign-in refused, refresh refused, unban restores login.
- **Known gap, deliberately deferred (owner ruling):** an access token issued
  *before* the ban still reads the data API until it expires (~1h default).
  Fix = make RLS consult closure status (probably inside
  `is_own_athlete_profile()`, used by every athlete policy). Do it as its own
  change with a dedicated RLS test pass — NOT during the live pilot, not
  bundled. Recorded in `docs/09-roadmap.md` on `dev`.
- **The web click-through checklist was never completed.** Process / decline /
  reinstate, status displays, and the re-add guard message have not been
  clicked through by a human. Neither has the mobile "Close my account" flow
  on a phone.

### ZZ-TEST data still in the shared database (clean up after the checklist)

Identify by the `ZZ-TEST` markers — athlete codes `ZZT-*`, names `ZZ-TEST`,
emails `zz-test-*-1790787291767@example.com`, club "ZZ-TEST CLUB".

| Thing | Id |
|---|---|
| ZZ-TEST CLUB | `ad2a48cb-4de0-4e5c-8d3e-1cd1a1f65e20` |
| ZZ-TEST TEAM | `db21248e-bfb4-4e9f-814a-5e283d75186d` |
| athlete "Process" (closure *requested*) | `0c30c611-5394-4848-b5be-0fdd09f14153` (auth user `e377157e-dc40-4bf1-91f9-de852eb9013d`) |
| athlete "Decline" (closure *requested*) | `34938c45-ef6a-4f8c-827e-49266f8ef815` (auth `ad58a570-e940-40b7-81a2-7528b19bec96`) |
| athlete "Reinstate" (closure *processed*, login really banned) | `50077dfa-72c2-48c6-8cb1-d9d981e3b201` (auth `7a7948af-6f65-4a5d-8ba2-d280b8372dff`) |
| athlete "Phone" (no closure; for the iPhone test) | `5fe588dd-1380-4218-bfd3-7b53066d07d2` (auth `dfcdd5dd-91f0-4a4b-8197-693dbfc6143a`) |

All four logins share one throwaway password (not recorded here). The cleanup
script that created/removed them lived in a temp directory and is gone — rewrite
it: delete athletes (cascades closures, teams links), then their profiles, then
the four auth users via the admin API, then the team and club, and verify zero
rows remain. A guard-test registration may also have left a "Guard Test"
athlete (code `ZZT-GUARD-1`) in that club if the owner ran it.

### Demo account for Apple review — KEEP until App Review is finished

Separate from ZZ-TEST. Login `appreview@bridgetx.co` (password was given to the
owner in chat on 2026-10-01; if lost, reset it via the Auth admin API — do not
write it in a repo). Fictional athlete "Alex Demo" in "Bridgetx Demo Club".

| Thing | Id |
|---|---|
| Bridgetx Demo Club | `21e72339-e461-4e82-bdb8-37479c955d08` |
| Demo First Team | `509a945d-d234-4cdd-8cd0-d05bcbe8221d` |
| athlete Alex Demo | `e7a762d4-d311-4187-b6f6-c8979217d438` (profile `276c2d41-5969-4ab5-8380-92e35b2bacf2`, auth `69cd99dd-4646-4ab2-93ef-eafe2ed3ca2c`) |
| demo practitioner "Sam Rivera (demo)" | profile `214a0fcb-7d88-4e2d-a386-378759124e15`, email `admin+demo-practitioner@bridgetx.co` (no login) |
| demo report | `d97e59e4-a574-4392-881e-5a2797f10136` (PDF at `21e72339-…/d97e59e4-….pdf` in `report-pdfs`) |

Content: 14 days of check-ins (12 completed, none dated today), 2 protocol
items, 3 assessments, a 45-day team training plan, 1 report with real PDF, 1
welcome message. **Dates are relative to 2026-10-01** — if review drags on for
weeks, refresh check-ins/plan. Verified by 18 server-side checks (sign-in, every
screen's reads, PDF download, submitting a check-in); **not seen on a real
device**. It will appear in Super Admin totals and the "no logo / no
prescription brand" alerts — cosmetic.

---

## 4. On `dev`, NOT approved for production — decide each one separately

`origin/dev` (`0d9473e`) is 20 commits ahead of `main`. Merging it would switch on:

- **Check-in reminder cron** (`/api/cron/checkin-reminders`, every 15 min) —
  sends REAL push notifications to athletes. Migrations 058/059.
- **Partnership payment reminder cron** (daily) — emails the admin inbox.
  Partnerships Super Admin UI, migrations 061–065.
- **Return-to-play symptom gate** (migration 060).
- Account closure (section 3).

All of these migrations are already applied to the shared DB, so production
code is *behind* the database it runs on (it works today). The owner will decide
on each item deliberately. To ship one: branch from `main`, lift just that
feature (expect conflicts in `lib/resend.ts`, `lib/supabase/database.types.ts`,
and docs — resolve by hand; the support-page release branch is the worked
example), type-check + lint, push the branch, hand over the compare link.

---

## 5. Privacy policy / legal — NOT live, pending lawyer review

The privacy policy and terms carry the "Draft — pending legal review" banner
(`components/legal/LegalShell.tsx`; remove banner + on-page notice together
after sign-off). Open items:

- **Section 11 closure paragraph is approved but NOT added.** Add after the
  existing "How to exercise them" box, nothing else reworded, when closure ships:
  > **Closing your account.** If you are an athlete using the Bridgetx app, you
  > can ask for your account to be closed from More → Close my account. Once we
  > have processed your request, your login is suspended and you will no longer
  > be able to sign in; until then, your account stays open. Closing your
  > account is not the same as deleting your data. Your check-ins, reports,
  > assessments and history are retained, because they are held for your club or
  > practitioner, who controls that record (see section 2). To ask for data to
  > be corrected or deleted, email admin@bridgetx.co as described above.
  (Says "controls", not "owns", to match section 2's controller wording — lawyer
  to confirm.)
- **Hashed-IP retention is not disclosed.** The support rate limiter keeps a
  SHA-256 hash of visitor IPs for 24h; still personal data; the policy doesn't
  say so.
- No DPA between Bridgetx and any club (clubs = controller, Bridgetx =
  processor). ICO registration unverified. No minors' guardian-consent process
  (docs/09-roadmap.md). Retention is "indefinite". No self-service export/erasure.

---

## 6. Git state at handoff

- Working folder is on `main` = `origin/main` = `478f991`, clean. This doc lives
  on branch `docs/handoff-2026-10-01` until the owner merges its PR.
- `dev` = `origin/dev` = `0d9473e`. Worktree `../bridge-website-hotfix` (branch
  `fix/partner-consultant-schema`, `a256bd1`) is pre-existing; leave it.
- Dev server: none running unless restarted (`npm run dev` → :3000).

---

## 7. What to do next (priority order)

1. **Merge this docs branch** (owner: PR link from the compare URL pattern above).
2. **Send one real message through https://www.bridgetx.co/support** and confirm
   it reaches admin@bridgetx.co (closes the last unverified piece of the
   support page). Stay under 3/hour from one IP.
3. **Apple submission support** — see `bridgetx-mobile/docs/HANDOFF.md`. The
   website side of that is just keeping `/support` and the privacy page up, and
   the demo account intact.
   **Progress 2026-10-01 evening:** EAS upload finished (verified); build 2 selected
   in App Store Connect and review fields (sign-in, contact, notes) complete —
   both owner-reported, not verified by Claude. **Still open: App Privacy
   questionnaire (draft answers in `bridgetx-mobile/docs/app-store-listing.md`) and
   screenshots. Ready to submit: NO, pending those two.** The privacy policy's
   "draft" banner is a rejection risk but not a hard block; the demo account
   (section 3) must stay intact through review.
4. **Finish the account-closure click-through** (web checklist + the iPhone
   "Close my account" flow), then **delete the ZZ-TEST data**. Then decide if/when
   closure ships (needs its own small branch: DB already live; web UI on `dev`;
   mobile in build 3).
5. **Decide each `dev` feature separately** (reminder cron, payment cron, RTP
   gate) — never the whole branch.
6. **Legal track:** lawyer review of privacy/terms, add the section 11 paragraph
   and hashed-IP disclosure, DPA with clubs, ICO registration, minors' consent.
7. **Deferred RLS work:** closed-athlete access-token window (section 3), as its
   own tested change.
8. Housekeeping: delete merged branches; remove the demo account's data only
   after App Review concludes.
