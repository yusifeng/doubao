# FRONTEND (Expo RN)

## 技术栈基线

- Expo SDK 55
- React Native + TypeScript
- NativeWind
- Jest + React Native Testing Library

## UI 与样式约定

- 优先使用 NativeWind `className` 描述样式。
- 复杂平台差异优先通过 RN 原生能力处理，不强行样式 hack。
- 颜色、间距等设计 token 随项目演进逐步沉淀，避免散落硬编码。

## 可访问性与字体缩放

- 默认保留系统字体缩放能力（不默认 `allowFontScaling={false}`）。
- 当大字号影响布局时，优先使用 `maxFontSizeMultiplier` 控制上限。
- 偏离该策略需在变更中说明原因与影响。

## 跨平台调试边界

- Android 与 iOS 调试以 `expo start --android/--ios` 为主。
- 原生构建路径（`expo run:*`）仅在需要原生能力验证时使用。
- Web 能力用于快速验证，不等价于移动端表现。

## 测试约定

- 组件测试覆盖“用户可观察行为”，避免过度绑定实现细节。
- 新增组件默认需要对应 `*.test.tsx`。
- 关键交互与文案渲染为最低验收线。
