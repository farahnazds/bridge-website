# Pinned third-party skill — do not auto-update

This is a **vendored copy** of one skill from a community repository. It is
deliberately NOT installed via `/plugin marketplace add` or the `uipro` CLI,
because both track upstream and would change what runs here without review.

| | |
|---|---|
| Source | https://github.com/nextlevelbuilder/ui-ux-pro-max-skill |
| Release tag | `v2.14.1` |
| Commit SHA | `abb7f2fd5a083fa1ff55c326a963ff0d95c33f99` |
| Tarball sha256 | `84d9342cbb94231e29ff8a99bab37da5f94a79b54d428cf88dbf35dec93d4996` |
| Vendored on | 2026-08-07 |
| Licence | MIT |
| Scope | project-local only — not `~/.claude/skills/` |

## Only one of seven skills was taken

The upstream repo bundles seven skills (`ui-ux-pro-max`, `design`,
`design-system`, `brand`, `ui-styling`, `banner-design`, `slides`) and 73
executable scripts. Only `ui-ux-pro-max` is installed here.

That exclusion is deliberate: `design-system/scripts/fetch-background.py`
downloads images from an external CDN at runtime, and nothing in this project
needs that. Narrower install, smaller surface.

## What was checked before installing

Scanned every file in this directory at the pinned SHA:

- **no** network calls — no `urllib`, `requests`, `urlopen`, sockets, no URLs
- **no** process execution — no `subprocess`, `os.system`, `popen`, `eval`,
  `__import__`
- **no** file deletion — no `shutil`, `os.remove`, `rmtree`, `unlink`
- **two** file writes, both in `scripts/design_system.py`: they emit
  `MASTER.md` and per-page override markdown, and refuse to overwrite an
  existing file without an explicit `--force`
- 44 files, 1.8 MB: 6 Python scripts, the rest CSV data and docs

This was a scan of the installed subset, not a line-by-line audit of all 73
scripts in the upstream repo.

## Updating

Manual and deliberate. To move to a newer version:

1. Read the upstream diff between this SHA and the target SHA
2. Re-run the safety scan above against the new files
3. Replace this directory and update the table

Do not run `uipro update`, and do not add the marketplace — either would
reintroduce silent updates.

## Precedence

`docs/06-design-system.md` wins on any conflict. See the rule in `CLAUDE.md`.
