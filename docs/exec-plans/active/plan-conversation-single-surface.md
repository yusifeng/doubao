# Plan: Conversation Single Surface

## 目标

将当前产品从“session 页 + 会话页 + 语音页”重构为“会话页 + 独立语音页 + 会话抽屉”，并确保文字/语音共享同一会话上下文。

## 本阶段约束

- 主页面入口是当前会话页，语音通过独立路由页承载。
- 文字模式与语音模式共享同一 `conversationId`、同一消息流、同一上下文。
- 会话列表不再是独立 route，只作为会话页左侧抽屉存在。
- 会话抽屉采用 `@react-navigation/drawer` / Expo Router Drawer 承载，移动端手势与开合动画由导航层负责。
- `/voice/[conversationId]` 作为语音主路由页，`/conversation/[conversationId]?mode=voice` 仅保留兼容跳转。
- 本阶段不新增设置页、不新增模型或音色 UI。

## 实现要点

- `/` 启动后直接进入最近一次活动会话；若不存在活动会话，沿用当前 bootstrap 自动创建默认会话。
- `/conversation/[conversationId]` 承载文字会话形态。
- `/voice/[conversationId]` 承载语音沉浸形态并复用同一 runtime 会话。
- 会话页负责：
  - 消息流展示
  - 文本输入发送
  - 语音路由入口
  - 会话抽屉开关
  - 新建会话 / 切换会话
  - 顶部标题区提供测试诊断入口：可弹窗查看当前 `sessionId`、角色与系统提示词（长文本滚动展示）
- 会话抽屉支持长按会话条目弹出操作菜单：`编辑对话名称` / `从对话列表删除`。
- 删除会话时遵循页面心智：
  - 删除非当前会话：仅更新列表，不触发当前页面路由跳转
  - 删除当前会话：自动切换到下一可用会话；若全部删除则创建默认会话
- 进入语音模式后自动开始收听，不再要求用户额外点击一次“开始通话”。
- 语音模式固定为头像沉浸视图，不再提供右上角“字”按钮与文本视图切换。
- 语音模式底部控制条采用四键结构：暂停/恢复收听、两个占位按钮、退出。
- 语音模式底部不展示“静音收音/恢复收音”提示文案，`内容由 AI 生成`位于四键控制条下方。
- 语音模式页面启用 keep-awake，防止自动息屏导致语音对话中断。
- 会话与消息需本地持久化；当前实现采用 AsyncStorage 仓库，后续可按规模迁移 SQLite。
- 当 assistant 正在播报时，第一键优先承担“手动点击打断”语义：
  - 中断当前 assistant 输出回合
  - 保留已经显示出的文本
  - 页面状态立即回到 `正在听...`
- Android Dialog SDK 链路已支持“用户插话自动打断”：
  - assistant 播报中若检测到用户开口，会自动打断当前输出并继续同一会话。
- Android Dialog SDK 链路已支持“会话内静音”：
  - 第一键在非播报阶段切换 `pauseTalking/resumeTalking`
  - 静音只暂停收麦，不挂断通话，不退出语音模式
- 语音模式页面移除调试按钮与长解释文案，优先保留沉浸体验。
- 语音模式退出后仍停留在同一会话，只切回文字模式，不创建新的页面心智。

## 验收

- 启动后默认进入当前会话而不是 session 列表页。
- 会话抽屉展示真实本地 conversation 数据，可新建、可切换、可长按改名/删除。
- 文字消息、语音最终转写、助手回复都回到同一消息流。
- 从文字模式切到语音模式，再切回文字模式，不丢当前上下文。
- 重启 App 后仍能恢复最近会话与历史消息。

## 进度记录

- 2026-04-08：
  - 修复“设置页经 sidebar 切会话后 A/B 会话互相抢占”问题：根因是 stack 中非焦点 `conversation/voice` 路由实例也在执行 URL->runtime 的 `selectConversation` 同步，导致 active 会话被后台页面反复改写。
  - 新增焦点门禁：仅当前聚焦路由允许执行会话同步（`useIsFocused` + `useRouteConversationSelection(enabled)`），后台页面不再参与会话选中。
  - 会话切换机制收敛：
    - 新增 `useConversationSwitchCoordinator` 作为 sidebar 会话切换/新建的单一入口，统一“语音停止 -> 会话动作 -> 路由跳转”的执行顺序。
    - 引入意图队列（保留最新 pending intent），降低快速连点时多入口并发写入导致的竞态风险。
    - runtime `selectConversation` 增加 selection epoch 过期保护，并支持按目标 `conversationId` 写入状态，避免旧请求回流覆盖新会话。
