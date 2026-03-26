# Architecture

本项目采用适配 RN/Expo 的分层思路，先以约定落地，后续再逐步机械化校验。

## 分层建议（按 feature 组织）

以未来 `src/features/<feature-name>` 为单位，建议分层：

1. `types`：领域类型、schema、DTO
2. `config`：领域配置常量与策略参数
3. `repo`：数据访问与边界解析（API/本地存储）
4. `service`：纯业务逻辑
5. `runtime`：状态编排、副作用组织
6. `ui`：组件与交互绑定

## 依赖方向（约定）

仅允许同层或向下依赖，不允许反向依赖：

- `types` -> `types`
- `config` -> `types`, `config`
- `repo` -> `types`, `config`, `repo`
- `service` -> `types`, `config`, `repo`, `service`
- `runtime` -> `types`, `config`, `repo`, `service`, `runtime`
- `ui` -> `types`, `config`, `repo`, `service`, `runtime`, `ui`

## Provider 架构（约定）

- `repo/service/runtime` 仅依赖 Provider 契约，不依赖具体实现。
- 具体实现由 App 组合层注入（Composition Root）。
- 当前优先约定的 Provider：
  - `StorageProvider`（本地持久化，如 SQLite）
  - `S2SProvider`（语音对话网关）
  - `AudioProvider`（采集与播放）
  - `DialogEngineProvider`（Android 官方 Dialog SDK 语音引擎）
  - `ReplyProvider`（业务侧 LLM / 回复生成）
  - `ObservabilityProvider`（结构化日志）

## 当前代码映射（迁移期）

- `app/`：Expo Router 路由入口与页面装配
- `src/features/voice-assistant/`：语音助手业务分层
- `src/core/providers/`：Provider 契约与实现
- `src/core/theme/`：视觉 token 与映射

当前约定：

- Router 只做页面编排与导航，不承载复杂业务逻辑；
- 会话状态由 feature runtime 统一维护，再经路由页面消费；
- 为避免 Expo Router 将 `src/app` 误判为路由根目录，非路由级 app 基础设施统一收口到 `src/core/`；
- 新增业务能力优先落入 `src/features/`，不要把业务逻辑写回 `app/`。
- Android 语音主链优先通过 `DialogEngineProvider` 暴露统一事件流；JS runtime 不直接依赖 Android 原生录音、播放、AEC 细节。
- `ReplyProvider` 仍保留为未来接入自有 LLM 的扩展点；当前 Android SDK 默认走服务端自动回复，SDK 负责 ASR/TTS/播放器。

## Expo 运行路径

- `pnpm run start`：通用开发服务
- `pnpm run android`：安卓调试（依赖可用设备/模拟器）
- `pnpm run ios`：iOS 调试
- `pnpm run web`：Web 调试
- `pnpm run android:run` / `pnpm run ios:run`：原生构建路径（工具链要求更高）

## 测试分层

- 第一优先级：组件测试（Jest + React Native Testing Library）
- 第二优先级：关键业务流程测试（随功能演进补充）
- 后续可引入 E2E（不在本阶段强制）
