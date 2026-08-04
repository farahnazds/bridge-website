# 🚀 Bridgetx Developer Cheat Sheet

> Last Updated: August 2026
> Owner: Farah
> Project: Bridgetx (bridge-website)

---

# 📌 Daily Workflow

## 1. Open the project

### [Laptop 1 name]
```powershell
cd "C:\Users\[username]\bridge-website"
```

### [Laptop 2 name]
```powershell
cd "C:\Users\[username]\bridge-website"
```

## 2. Pull the latest changes
Always do this before you start coding — even if you're the only one
pushing, this keeps your two laptops in sync with each other.
```powershell
git pull origin main
```

## 3. Start the website
```powershell
npm run dev
```
Open [http://localhost:3000](http://localhost:3000)

## 4. Start Claude Code
```powershell
claude
```

---

# 🧠 The Prompt I Start Every Claude Code Session With

```
Read CLAUDE.md first.

Before building anything, check docs/09-roadmap.md — only build what's
listed under Launch Scope. If something is Foundation Only, tell me
instead of building a dashboard for it.

Check docs/02-roles-and-permissions.md for exactly what this role can
see/edit before touching any dashboard or form.

Check docs/06-design-system.md for colors, fonts, and spacing — don't
invent new ones.

Work in one small, single-purpose step. Don't build multiple pages or
features in one go — build one thing, tell me what you built and why,
and stop.

Explain what you're changing before writing code.

Use TypeScript, keep components reusable, follow existing patterns in
the codebase rather than introducing a new one.

Don't touch database/schema.sql directly — if a schema change is
needed, tell me what and why, and I'll confirm before you generate a
migration.
```

---

# 🎯 Bridgetx-Specific Reminders (things we deliberately decided)

Things Claude Code sometimes needs re-pointed to, since they're specific
decisions from planning, not generic best practice:

- ✅ **No report confirmation gate** — practitioners share their own
  reports directly. Don't reintroduce an approval step.
- ✅ **Data provenance is never overwritten** — edits are a new history
  event, the original provider stays attributed. See
  `docs/05-business-rules.md`.
- ✅ **Club Athletes have zero self-editable fields** — not even a
  profile photo. Only Guided/Independent Athletes (if subscribed)
  self-edit.
- ✅ **Compliance check-in is always available**, regardless of
  subscription status — the one universal exception.
- ✅ **Clinical + Research citations only come from the library** — no
  external/training-knowledge fallback, ever.
- ✅ **Club branding & report templates are Super Admin only** — never
  give Club Manager access to this.
- ⛔ Don't build Independent Athlete, Guided Athlete, or Independent
  Practitioner *dashboards* yet — the schema/logic exists
  (Foundation Only), the UI comes later. Check `docs/09-roadmap.md`
  before starting anything for these roles.
- ⛔ Don't build Stripe checkout, live glucose/CGM integration, or the
  Data Moat/Effectiveness Engine — explicitly deferred.

---

# 📁 Navigation

```powershell
pwd                # current folder
dir                 # list files
dir -Force          # show hidden files
code .              # open project in VS Code
```

---

# 🌿 Git

```powershell
git --version
git status
git branch
git remote -v
git log --oneline --graph --decorate --all
```

## Saving changes
```powershell
git add .
git commit -m "Describe what you changed"
git push origin main
```

Good commit message examples:
```
git commit -m "Add club manager athlete list page"
git commit -m "Wire up Supabase auth for club athlete activation"
git commit -m "Fix compliance yesterday/today logic"
```

## Undo mistakes
```powershell
git log --oneline              # see history
git diff                       # see what changed, uncommitted
git restore app/page.tsx       # restore ONE file
git restore .                  # restore EVERYTHING (deletes unstaged changes — careful)
```

---

# 🌎 Vercel

```powershell
vercel --version
vercel              # deploy preview
vercel --prod       # deploy production
vercel link         # check linked project
```

**Staging reminder:** once your first club is live, changes should go
to the staging domain/branch first, confirmed working, then merged to
production. See `docs/08-integrations.md`.

---

# 🤖 Claude Code

```powershell
claude --version
claude              # launch
```

Useful in-session commands:
```
/help
/clear
/exit
```

---

# 🗄️ Supabase

Environment variables live in `.env.local` (never committed):
```
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY     # server-side only — never expose to the browser
```

Connection file: `lib/supabase.ts`

**Where to check things visually instead of writing SQL:**
Supabase Dashboard → Table Editor (browse data), SQL Editor (run
queries/migrations), Storage (report-pdfs, profile-photos buckets),
Authentication (see registered users, manually reset a password if an
invite email fails).

**Don't run schema changes directly in the Supabase dashboard** without
also updating `database/schema.sql` and `database/tables-overview.md` —
otherwise the docs drift out of sync with the real database.

---

# 📦 Node

```powershell
node -v
npm -v
npm install
npm install package-name
```

---

# 🛠️ Build

```powershell
npm run build     # production build
npm start         # run production build locally
```

---

# 📂 Project Structure

```
app/            → pages & routes (Claude Code creates folders here as needed)
components/
lib/            → Supabase client, auth helpers
hooks/
services/
types/
utils/
database/       → schema.sql, tables-overview.md, rls-policies.md, migrations/
docs/           → 01-overview through 10-athlete-data-fields (source of truth)
prompts/        → report-generation.md
public/         → brand assets, logos
CLAUDE.md       → Claude Code reads this every session
```

---

# 📋 Before Every Coding Session
- ✅ `git pull origin main`
- ✅ `npm run dev`
- ✅ `claude`

# 📋 Before Every Push
- ✅ Website works, click through what you just built
- ✅ No console errors
- ✅ `git status` — check what's actually changing
- ✅ `git add .`
- ✅ `git commit -m "..."`
- ✅ `git push`

---

# 💡 Bridgetx Rules

- ✔ Pull before coding, push after coding
- ✔ Keep commits small and specific
- ✔ Test after every feature, don't stack untested changes
- ✔ Document major decisions back into `docs/`, not just in your head
- ✔ Never upload `.env.local`
- ✔ Ask Claude Code to explain unfamiliar code before moving on
- ✔ If you and Claude (the planning assistant) revisit a decision, update
  the relevant `docs/` file afterward

---

# 🚨 Emergency Commands

Something isn't working?
```powershell
rm -r node_modules
del package-lock.json
npm install
```

---

# 🎯 Current Stack

**Frontend:** Next.js, React, TypeScript, Tailwind CSS
**Backend:** Supabase (Postgres, Auth, Storage)
**AI:** Claude API (report generation)
**Email:** Resend
**Payments:** Stripe (foundation only, not active)
**Hosting:** Vercel
**Repository:** GitHub

---

# 🚀 Learning Roadmap

- ✅ Git
- ✅ GitHub
- ✅ Next.js
- ✅ TypeScript
- ✅ Tailwind
- ⬜ Supabase
- ⬜ Authentication
- ⬜ Database Design
- ⬜ Row Level Security
- ⬜ AI Integration
- ⬜ Stripe
- ⬜ CI/CD