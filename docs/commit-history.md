# Commit History

> 目的：作为每次提交前的留痕文档。  
> 规则：每次 `git commit` 前必须新增一条记录。

## 记录模板

```md
## YYYY-MM-DD HH:mm (Asia/Shanghai) - <short-title>

- Commit: <hash-or-pending>
- Author: <name>
- Scope:
  - <path-or-module-1>
  - <path-or-module-2>
- Summary:
  - <change-1>
  - <change-2>
- Tests:
  - <command/result>
- Risk:
  - <known-risk>
- Rollback:
  - <rollback-plan>
```

## Entries

## 2026-03-25 01:50 (Asia/Shanghai) - my-doubao2-router-migration-runtime-validation

- Commit: pending
- Author: Codex
- Scope:
  - `app/`
  - `src/features/voice-assistant/`
  - `src/core/`
  - `ARCHITECTURE.md`
  - `docs/exec-plans/active/plan-my-doubao2-migration.md`
  - `docs/pitfalls/index.md`
  - `docs/pitfalls/expo-router-src-app-root-conflict.md`
- Summary:
  - Migrated the shared app-level infrastructure from `src/app/*` to `src/core/*` after confirming Expo Router was wrongly treating `src/app` as the route root.
  - Updated runtime imports so the voice assistant feature now resolves providers from `src/core/providers`.
  - Verified NativeWind and Expo Router together in the new repo by relaunching Metro on a clean dev-client session and confirming the real `app/` routes render.
  - Validated Android runtime behavior on the emulator:
    - home route renders the intended hero/status layout;
    - conversation route renders and can send a text round through S2S;
    - voice route requests microphone permission, enters listening state, and can hang up back to idle.
  - Added a dedicated pitfall document for the Expo Router `src/app` root conflict so the directory naming rule is explicit in this repo.
- Tests:
  - `pnpm exec tsc --noEmit` (pass)
  - `pnpm run test --runInBand` (pass, 8 suites / 28 tests)
  - Android emulator smoke test via Expo Dev Client on port `8081` (pass)
- Risk:
  - The Android validation was done on emulator + dev client; long-running voice quality still needs follow-up on a physical device.
  - The current audio provider still emits the `expo-av` deprecation warning and should eventually move to Expo's newer audio stack.
- Rollback:
  - Move `src/core/*` back to the previous location only if Router root is reconfigured explicitly; otherwise keep the current structure.

## 2026-03-24 10:42 (Asia/Shanghai) - realtime-lifecycle-hardening-and-skill-alignment

- Commit: pending
- Author: Codex
- Scope:
  - `.codex/skills/loop-workflow/SKILL.md`
  - `src/features/voice-assistant/runtime/useTextChat.ts`
  - `src/app/providers/audio/expoRealtime.ts`
  - `src/app/providers/s2s/websocket.ts`
  - `src/features/voice-assistant/runtime/__tests__/useTextChat.test.tsx`
  - `src/app/providers/s2s/__tests__/websocket.test.ts`
  - `src/features/voice-assistant/service/__tests__/assistantText.test.ts`
  - `docs/design-docs/voice-assistant-ui-parity.md`
  - `handoff.md`
  - `src/features/voice-assistant/ui/__tests__/VoiceAssistantScreen.test.tsx`
  - `docs/exec-plans/active/plan-realtime-voice-code-optimization.md`
- Summary:
  - Rewrote loop-workflow skill to fit this repo (`pnpm` flow, docs-first, risk-based verification, commit-history pre-commit gate).
  - Refactored realtime call lifecycle in `useTextChat.ts`:
    - added lifecycle lock to prevent concurrent start/stop races;
    - split realtime start logic into dedicated orchestration function;
    - introduced per-call generation token so stale loops auto-exit;
    - added `realtimeCallPhaseRef` and shared `resetRealtimeCallState` cleanup;
    - extracted assistant audio append helper and reduced duplicated append blocks.
  - Hardened audio provider:
    - made `startCapture` / `stopCapture` idempotent;
    - replaced global `removeAllListeners('data')` with instance-scoped listener management;
    - centralized capture audio mode config constant;
    - added capture health counters (`frame count / bytes / lastFrameAt`) for diagnosis;
    - added cooldown-based native live PCM capture fallback so Android no longer retries a broken native path on every start.
  - Hardened S2S provider:
    - added explicit connection phase state (`disconnected/connected/session_started`);
    - added session-start precondition checks for sending/waiting operations;
    - cleared audio queue in turn reset to avoid cross-turn leakage;
    - grouped turn-level text state under `turnState`;
    - tagged queue timeout logs and recorded finalized-turn counters for easier diagnosis;
    - strengthened duplicate completed-turn guard to absorb retransmitted final snapshots/chunks.
  - Fully normalized `useTextChat` runtime status transitions through one helper (`machine -> repo -> UI refresh`) and removed the old test-only realtime fallback branch so all realtime mode paths share one orchestration path.
  - Updated UI test to support both voice labels (`开始/结束语音` and `开始/挂断通话`) based on mode.
  - Added websocket tests for session phase precondition and turn-state reset behavior.
  - Added UI regression coverage for quick repeated voice-button taps to verify stable state under rapid interaction.
  - Added hook-level lifecycle lock regression coverage to ensure concurrent `toggleVoice()` calls trigger only one realtime start pipeline.
  - Refreshed `VoiceAssistantScreen` visual structure toward the `my-doubao-pic` reference style with a warmer product-like card layout and updated theme tokens.
  - Exposed realtime call phase and runtime hint to the screen so voice button text and status indicator reflect internal call state.
  - Added UI parity notes and updated design documentation with the optimized realtime lifecycle and UI alignment rules.
  - Tightened assistant-text dedupe for short repeated sentence blocks, preserved punctuation, and added explicit regression coverage.
  - Added dedupe throttling for repeated assistant warning/error hints and centralized audio error-to-copy mapping.
  - Added `ExpoRealtimeAudioProvider` idempotency tests for repeated `startCapture/stopCapture`.
  - Captured Pixel 3a and taller Android viewport screenshots for UI parity verification.
  - Shrunk `handoff.md` back to a concise current-state summary and completed the optimization plan checklist.
- Tests:
  - `pnpm exec tsc --noEmit` (pass)
  - `pnpm run test --runInBand` (pass, 6 suites / 24 tests)
- Risk:
  - Realtime lifecycle changes are broad in a central hook; needs device-level smoke test for long-running sessions.
  - S2S phase checks may surface hidden call-order issues in untested edge paths.
  - Native Android audio still depends on emulator/device host audio quality, even though code-side fallback boundaries are now tighter.
- Rollback:
  - Revert the listed files to previous version and keep only the skill/documentation updates.

## 2026-03-24 (Asia/Shanghai) - fix-nativewind-metro-resolver

- Commit: pending
- Author: Codex
- Scope:
  - `package.json`
  - `.npmrc` (新建)
  - `app.json`
  - `pnpm-lock.yaml`
- Summary:
  - 从 `package.json` 移除了手动列入的 `react-native-css-interop` 直接依赖。
    该包是 nativewind 的内部依赖，手动声明后 pnpm 会产生多实例（不同 peer-dep 后缀的 instance），
    导致 Metro resolver 的 `./interop-poison.pill` 拦截失效，`verifyInstallation` 报
    "config.resolver.resolveRequest non-composable" 错误，全部 className 不生效。
  - 新建 `.npmrc`，设置 `node-linker=hoisted`，让 pnpm 以 hoisted 模式安装依赖。
    Hoisted 模式下每个包在 `node_modules` 中只有一个真实目录（非 symlink），
    消除了 pnpm isolated 模式下 Metro 跟随 symlink 路径不稳定的问题。
  - 在 `app.json` 的 `web` 字段中补充 `"bundler": "metro"`，
    符合 NativeWind v4 官方 Expo 安装文档要求。
  - 清空了 `node_modules/react-native-css-interop/.cache/`，
    避免旧的空缓存文件干扰首次构建。
- Tests:
  - `pnpm exec tsc --noEmit` (pass)
  - `pnpm run test --runInBand` (pass, 6 suites / 24 tests)
  - Node 验证：`resolver('./interop-poison.pill') -> { type: 'empty' }` ✓
  - Node 验证：nativewind 与项目共享同一 react-native-css-interop 实例 ✓
- Risk:
  - Hoisted 模式与 isolated 模式相比可能暴露隐式依赖（phantom deps）。
    若后续 pnpm install 报缺依赖，在 package.json 中显式声明即可。
  - 需要配合 `expo start -c`（--clear）运行，以强制 Metro 重新生成 bundle，
    否则旧缓存 bundle 中的空 CSS 文件仍会使 className 不生效。
- Rollback:
  - 删除 `.npmrc`，在 `package.json` 中还原 `react-native-css-interop` 依赖，
    还原 `app.json`，重新 `pnpm install`。

## 2026-03-24 10:05 (Asia/Shanghai) - enforce-commit-history-rule

- Commit: pending
- Author: Codex
- Scope:
  - `AGENTS.md`
  - `docs/commit-history.md`
- Summary:
  - Added a mandatory rule in `AGENTS.md`: update `docs/commit-history.md` before every commit.
  - Created `docs/commit-history.md` with a reusable entry template.
- Tests:
  - Manual check: file exists and rule text present in `AGENTS.md`.
- Risk:
  - Team may forget to follow the template details when rushing.
- Rollback:
  - Remove the commit-history section from `AGENTS.md` and delete `docs/commit-history.md`.
