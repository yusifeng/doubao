# Expo Router 与 `src/app` 目录冲突

## 现象

在 `my-doubao2` 中已经创建了真正的 Expo Router 路由目录 `app/`，但 Android 运行时始终没有进入这些页面，表现为：

- Dev Client 能连上 Metro；
- `NativeWind verifyInstallation() found no errors` 已经出现；
- 但是首页没有展示我们写的 `app/index.tsx`，而是停在空白加载态或 Dev Client 壳层；
- Metro 日志里出现：
  - `Using src/app as the root directory for Expo Router.`

## 为什么会这样

Expo Router 会优先把 `src/app` 识别为路由根目录。

而迁移时我们沿用了旧仓库的分层命名，把 Provider 与 theme 放在了：

- `src/app/providers`
- `src/app/theme`

这让 Expo Router 误以为 `src/app` 是路由目录，结果真正的 `app/` 路由文件没有被消费，页面就看起来像“路由失效”或“白屏”。

## 容易误判的地方

这类问题特别像以下几种错误，但其实都不是根因：

1. `NativeWind` 样式没生效；
2. Expo Dev Client 没连上 Metro；
3. `app/_layout.tsx` 写错；
4. 页面组件渲染报错。

之所以容易误判，是因为底层日志看起来都“差不多正常”：

- Metro 在跑；
- `Running "main"` 正常；
- `verifyInstallation()` 也正常；
- 但真正的 Router 根目录已经指偏了。

## 最终根因

根因不是 Expo Router 坏了，而是**目录命名与 Expo Router 的默认约定冲突**：

- `app/` 想做路由入口；
- `src/app/` 又被拿来放 app-level infrastructure；
- Expo Router 自动把 `src/app` 当作路由根目录。

## 修复方式

把所有非路由的 `src/app/*` 迁走，统一放到不会与 Router 争抢根目录的层级：

- `src/core/providers/*`
- `src/core/theme/*`

并同步更新：

- 业务代码 import
- 架构文档
- 迁移计划文档

## 怎么验证修好

至少同时满足下面几条：

1. Metro 启动日志不再出现：
   - `Using src/app as the root directory for Expo Router.`
2. Dev Client 进入后能真正展示 `app/index.tsx` 对应首页；
3. 首页、会话页、语音页都能通过点击进入；
4. `NativeWind` 样式正常落屏；
5. 文本消息回合能正常收发。

## 这次在仓库中的最终决策

本仓库采用：

- `app/`：唯一路由入口
- `src/core/`：Provider、theme 等 app-level 非路由基础设施
- `src/features/`：业务功能

不要再把非路由代码放回 `src/app/`。
