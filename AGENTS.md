# AGENTS.md — rules for AI sessions in this repo (Seidar frontend copy)

## 1. Commit after every change (non-negotiable)

- Commit each completed unit of work immediately — a fix, a feature step, a
  design tweak, a config change. Do not batch unrelated work into one commit,
  do not wait until the end of a session.
- Never end a turn or session with uncommitted changes: run
  `git status --short` first; stage and commit anything that should be kept,
  or say explicitly why it is left out.
- Verify before committing: `npx tsc --noEmit -p tsconfig.json` from `app/`
  must be clean; UI changes should also be checked live in the browser.
- Never commit secrets. `.env.local` is git-ignored; only `.env.example`
  placeholders may be committed.
- Do not push, amend, or force-push unless the user explicitly asks.
- Message style: `seidar: <short summary>` — one line; add `-m` body lines
  only when the change needs context.

## 2. Repo map

- `app/` — Next.js UI (dev server on `:3005`), talks to the API at `:3002`;
  styles in `app/src/app/shell.css`, screens in
  `app/src/components/` (`views.tsx`, `markets-hub.tsx`, `shell.tsx`).
- `packages/*` — shared workspace packages (`seidar-sdk`, `positions-sdk`,
  `automation-sdk`, `tokens`, `vaults`).
- `app/dev.log` — dev-server log (git-ignored).

## 3. Standing rules

- Live data only — no mocks, no stubbed prices or pools; an unknown number
  shows `—` or `0`, never a fake one.
- This copy is for dashboard/product design iteration; `real_seidar` remains
  the source repo with the API, contracts and its own commit rules.
