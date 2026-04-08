# Plan: Voice Assistant Storage/Runtime Refactor

## 目标

以“架构优先”方式重建语音助手的数据与状态基础设施，先解决可维护性和一致性问题，再回收 UI 体验问题。

## 已冻结决策

- 存储底座：`SQLite + Drizzle ORM`
- Store 边界：仅用于 `runtime` 编排态，不承载持久化实体
- Session 语义：聊天线程与语音运行会话分离建模
- 迁移策略：不迁移旧 AsyncStorage 历史会话数据
- 链路策略：保持“禁兜底”，配置不完整直接显式报错

## 执行阶段

### Phase 1（当前）: Storage Foundation

- [x] 新增 SQLite schema：`chat_session` / `chat_message` / `runtime_config` / `voice_session` / `voice_session_event` / `schema_version`
- [x] 接入数据库初始化与版本迁移框架
- [x] 新增 repo 契约：`SessionRepo`、`MessageRepo`、`VoiceSessionLogRepo`
- [x] 新增 SQLite repo 实现
- [x] 将现有 `PersistentConversationRepo` 切换到底层 SQLite（接口保持不变，非 SQLite 运行时维持 AsyncStorage 兼容回退）

### Phase 2: Runtime Store Introduction

- [x] 引入 store lib（Zustand），仅托管 runtime 编排态
- [x] 清理 `useTextChat` 业务态 `ref`，保留副作用句柄型 `ref`
- [x] 将会话状态迁移为 reducer/store 单一路径写入

### Phase 3: Debt Cleanup + UX Regression Fixes

- [x] 用数据库幂等约束替换临时防重复补丁
- [x] 收敛消息草稿渲染路径，解决首帧闪烁
- [x] 统一错误与故障签名，补齐 runbook

## 验收标准

- `pnpm exec tsc --noEmit` 通过
- 相关测试通过（优先 runtime/repo 目标测试）
- Android 可编译：`./android/gradlew -p android :app:compileDebugKotlin`
- 文档与代码同步更新（包含 `docs/commit-history.md`）
