# Voice Assistant UI Parity Notes

## Figma Baseline

- File key: `xslmiLsD9WDdEkb4W1iBJe`
- Session list: node `2003:442`
- Conversation detail: node `2003:331`
- Voice scene: node `2003:606`

## Visual Direction

### Session list

- White canvas with very light dividers instead of a framed warm shell.
- Simple centered top title bar with left utility action and right search/edit actions.
- Featured official row for `豆包` with a tiny `doubao.com` badge.
- Dense chat list rows: circular pastel avatar, 17px title, 14px muted preview.
- Session rows are backed by the real local conversation repo; mock showcase rows are removed.
- Bottom tab bar with three simple tabs and a small unread badge.

### Conversation detail

- White chat surface with translucent top header.
- User message bubble: right aligned bright blue pill.
- Assistant short reply: left aligned light gray bubble.
- Assistant long reply: soft outer card + inner white panel + action icons row.
- Non-existent quick-action chips are removed; only real mode switch and connection actions remain.
- Composer is a bottom dock with camera, pill input, mic button, and conditional send action.

### Voice scene

- Pink / purple / sky pastel full-screen atmosphere.
- Large centered round avatar with soft white rings.
- Middle listening dots + short status copy.
- Bottom row of four circular controls, with a clear danger hang-up action.
- Lightweight transcript capsule keeps runtime/debug visibility without falling back to the old debug layout.
- Non-functional media shortcut buttons are removed from the runtime scene.

## Implementation Rules

- NativeWind remains the primary styling path.
- Static class strings only; no dynamic Tailwind token interpolation.
- `StyleSheet` is limited to shadows, depth, and a few size-sensitive visual touches.
- Shared visual semantics live in `src/core/theme/mappers.ts` and `src/core/theme/tokens.ts`.
- Shared chat rendering lives in `src/features/voice-assistant/ui/VoiceAssistantMessageBubble.tsx`.

## Current Acceptance Checklist

- [x] Home route follows Figma node `2003:442` instead of the previous orange hero shell.
- [x] Conversation route follows Figma node `2003:331` with iMessage-like bubble hierarchy.
- [x] Voice route follows Figma node `2003:606` with full-screen pastel scene layout.
- [x] NativeWind is still the dominant styling mechanism.
- [x] Tokens/mappers remain the single semantic source for page-level styling.
