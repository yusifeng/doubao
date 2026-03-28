---
name: loop-workflow
description: "Use when implementing changes in this repo and you need a strict, repeatable dev loop: docs-first alignment, one-mainline-task execution, pnpm-only commands, targeted verification, and mandatory commit-history update before commit."
---

# Loop Workflow

## Scope

Use this workflow for day-to-day implementation in this repository.
It is tailored for current project constraints:

- Expo RN + TypeScript
- Docs First (Harness style)
- `pnpm` package manager only
- Voice assistant path has realtime/audio-specific verification needs

## Mandatory repo alignment (before coding)

1. Read project constraints in:
   - `AGENTS.md`
   - `ARCHITECTURE.md`
   - `docs/index.md`
2. Identify the active execution plan under:
   - `docs/exec-plans/active/`
3. Keep one mainline objective. If new ideas appear, park them in plan/docs instead of scope-hopping.

## Default dev loop (repeat for each TODO item)

1. Pick one mainline task
   - Finish it end-to-end before opening another task.

2. Clarify acceptance in docs first
   - If behavior/constraints change, update docs in the same iteration.

3. Add/update tests (when feasible)
   - Prefer smallest tests that lock expected behavior.

4. Implement minimal change
   - Keep diff focused and reversible.

5. Quick optimization pass (required)
   - Remove obvious dead code introduced by the change.
   - Collapse low-risk duplication/branching without changing behavior.

6. Run targeted verification (no blanket heavy runs unless needed)
   - Type check: `pnpm exec tsc --noEmit`
   - Related tests: `pnpm run test -- <related-test-file>`
   - Full tests only when needed: `pnpm run test --runInBand`
   - Do not run coverage by default (`pnpm run test:coverage` only when explicitly requested).

7. Run codex review (quality gate, before pre-commit)
   - Run after targeted verification, before staging/commit.
   - Use repo-standard profile from `AGENTS.md`:
     - `codex review --uncommitted -c model="gpt-5.3-codex" -c model_reasoning_effort="medium"`
   - Tool-call timeout must be at least `1200000` ms.
   - For docs-only commits, review may be skipped unless explicitly requested.

8. Voice-path verification (risk-based, not every commit)
   - Fast path (default, most commits):
     - Run `pnpm exec tsc --noEmit`
     - Run targeted tests only
     - If needed, do lightweight log review from existing run
   - Medium path (when touching realtime runtime logic but no native boundary changes):
     - Do fast path + quick manual smoke on current running app
   - Heavy path (only when required):
     - Trigger only if native audio modules, protocol framing, or build config changed;
       also run before handoff/release candidate.
     - Build/run Android once: `CI=0 pnpm run android:run`
     - Focused logs:
       - `adb logcat -d | rg "voice-assistant|s2s|live_pcm|StartConnection|StartSession|audio"`
   - Heavy path is **not** required for every commit.

9. Pre-commit gate (mandatory)
   - Check staged scope: `git status --short`
   - Ensure docs sync is done for behavior/architecture changes.
   - **Update `docs/commit-history.md` before every commit** (required by `AGENTS.md`).

10. Commit
   - One concern per commit.
   - Keep commit small and reviewable.

## Guardrails

- Use `pnpm` only; do not switch to `bun`/`npm`/`yarn` in this repo workflow.
- Avoid unrelated formatting churn during feature/bug work.
- Do not silently change product direction; keep implementation aligned with current active plan.
- If runtime behavior differs from expectation, prefer log-backed diagnosis before additional code layering.
- Do not require full Android rebuild on every commit; use risk-based verification.

## Quick command reference

```bash
# Install deps
pnpm install

# Type check
pnpm exec tsc --noEmit

# Start metro/dev client
pnpm run start -- --dev-client

# Android run (native build/install)
CI=0 pnpm run android:run

# Tests
pnpm run test -- <file-or-pattern>
pnpm run test --runInBand

# Code review gate (required for code changes)
codex review --uncommitted -c model="gpt-5.3-codex" -c model_reasoning_effort="medium"

# Focused Android logs
adb logcat -d | rg "voice-assistant|ReactNativeJS|s2s|audio|Exception|Error"
```

## Done criteria for one loop item

- Mainline task accepted against its docs/plan context.
- Required tests/checks for touched area passed.
- Relevant docs updated.
- `docs/commit-history.md` updated (before commit).
- Change remains small, readable, and reversible.
