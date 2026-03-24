# Realtime Voice Code Optimization Plan (Stability First)

## Execution Constraint

- Priority: highest.
- Work mode: continuous implementation until the whole checklist is completed.
- Delivery expectation: all items implemented and runnable without runtime errors before handoff.
- Reporting style: minimize progress chatter during execution; focus on shipping finished code.

## Context

This plan is for **code optimization only** on the realtime voice path.
No product behavior expansion, no feature branching, no UX redesign.

Primary path in scope:

- Start call -> continuous upstream audio -> server response -> streaming playback -> stop call.

## Goals

- Reduce state-flapping and race conditions.
- Make session lifecycle deterministic and idempotent.
- Reduce duplicated assistant text and self-loop risk.
- Improve observability for quick on-device diagnosis.
- Keep codebase easier to maintain and reason about.

## Non-Goals

- No new feature modes.
- No protocol migration.
- No role/persona strategy changes.
- No broad UI redesign.

## Execution Checklist

### A) Runtime session control (`useTextChat.ts`)

- [x] Split `toggleVoice` into explicit `startRealtimeCall` / `stopRealtimeCall` orchestration functions.
- [x] Introduce a lifecycle lock (`callLifecycleLockRef`) to prevent concurrent start/stop pipelines.
- [x] Replace dual-loop flags with a single source of truth (`callPhaseRef`) to avoid contradictory states.
- [x] Add per-call generation token; old loops auto-exit when token mismatches.
- [x] Consolidate common cleanup into one `resetRealtimeCallState` function.
- [x] Normalize state transition order: machine -> repo -> UI refresh.
- [x] Centralize retry/backoff constants in one block and remove duplicated literals.
- [x] Extract `appendAssistantSystemHint` helper to avoid repeated repo append blocks.
- [x] Ensure every error path always releases lock and updates call phase.
- [x] Remove unreachable fallback branches after final error handler unification.

### B) Audio capture/playback provider (`expoRealtime.ts`)

- [x] Make `startCapture` fully idempotent: repeated calls while active become no-op.
- [x] Make `stopCapture` fully idempotent: repeated calls after stop become no-op.
- [x] Ensure native stream listener registration/unregistration is symmetric and explicit.
- [x] Remove broad `removeAllListeners('data')` side effect; use instance-scoped listener only.
- [x] Add lightweight capture health counters: frame count, last frame timestamp, bytes sent.
- [x] Expose debug snapshot method for capture/playback health (read-only).
- [x] Keep audio mode config in a named constant and apply once per capture session.
- [x] Harden fallback path boundaries (native stream -> expo-av) with clear logs and cooldown.
- [x] Guard PCM normalization: invalid/empty input exits early and records reason.
- [x] Reduce log flood for recurring native playback failures via throttled warn logging.

### C) S2S session/channel provider (`websocket.ts`)

- [x] Formalize connection/session state machine (`disconnected/connected/session_started`).
- [x] Validate method preconditions consistently (`sendAudioFrame`, `sendTextQuery`, waits).
- [x] Keep `interrupt` local-only and mark protocol rationale in comments.
- [x] Encapsulate per-turn buffers into a `turnState` object to reduce scattered fields.
- [x] Use one utility for queue timeouts with tagged context (`audio/text/frame/control`).
- [x] Improve turn-end handling: only finalize when there is effective assistant content.
- [x] Strengthen duplicate completion guard for retransmitted final chunks.
- [x] Record structured counters: sent audio frames, received audio chunks, finalized turns.
- [x] Normalize control-frame timeout errors into actionable messages.
- [x] Keep speaker fallback path deterministic and bounded.

### D) Text normalization and dedup

- [x] Keep one canonical assistant text sanitize pipeline (no duplicated cleaning logic).
- [x] Add sentence-block dedup guard for repeated tail blocks.
- [x] Preserve punctuation where possible after dedup, avoid over-aggressive collapse.
- [x] Add deterministic tests for duplicate patterns (`A+A`, `A+B+A+B`, overlap merge).

### E) UI/state reflection (`VoiceAssistantScreen.tsx`)

- [x] Ensure button label strictly reflects internal call phase.
- [x] Add a small non-intrusive runtime indicator for upstream activity (debug-friendly).
- [x] Throttle repeated identical warning text to prevent UI spam.
- [x] Keep error text mapping deterministic by error type.

### F) Provider construction (`runtime/providers.ts`)

- [x] Ensure provider instances are created once per hook lifecycle (no accidental re-init).
- [x] Keep test/runtime provider boundaries explicit and isolated.

### G) Tests and verification

- [x] Add unit tests for websocket turn finalization and duplicate prevention.
- [x] Add runtime tests for rapid tap start/stop race handling.
- [x] Add test for lifecycle lock correctness (no double start).
- [x] Add test for idempotent capture stop/start behavior.
- [x] Run `pnpm exec tsc --noEmit` and ensure zero new TS issues.
- [x] Run `pnpm run test --runInBand` and ensure all pass.

### H) Docs sync

- [x] Update design doc with final realtime lifecycle diagram and failure recovery.
- [x] Update active implementation plan with this optimization stage status.
- [x] Keep `handoff.md` as concise summary only (no large optimization checklist dump).

### I) UI style parity (`my-doubao-pic` reference)

- [x] Use `my-doubao-pic/*.jpg` as fixed visual references and extract a concrete style checklist (color, spacing, typography, radius, shadows, icon sizes).
- [x] Rebuild page layout in `VoiceAssistantScreen.tsx` to match reference structure order and vertical rhythm.
- [x] Create page-level design tokens for this screen (do not hardcode scattered values).
- [x] Align top area (title/status/mode) visual hierarchy with reference screenshots.
- [x] Align message list container width, padding, and line-height with reference screenshots.
- [x] Align input area (placeholder style, send button proportions, spacing) with reference screenshots.
- [x] Align voice button visuals (size, corner radius, icon scale, pressed/disabled state) with reference screenshots.
- [x] Add subtle background/gradient treatment to match screenshot atmosphere (while preserving readability).
- [x] Ensure parity on common Android viewport sizes (Pixel 3a baseline + one taller device).
- [x] Add before/after screenshots to `assets/` for visual diff review.
- [x] Add a small "UI parity acceptance" checklist in docs with pass/fail snapshots.

## Acceptance Criteria

- Start/stop call does not flap under rapid user taps.
- No repeated assistant message commit for one server turn.
- Upstream audio loop remains stable across continuous multi-turn chat.
- No protocol-invalid interrupt behavior.
- Code paths and logs are diagnosable within one logcat session.
- Main screen style is visually aligned with `my-doubao-pic` references on Android baseline devices.
