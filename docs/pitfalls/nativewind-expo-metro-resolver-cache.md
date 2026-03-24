# NativeWind Expo Metro Resolver 与缓存问题（className 不生效）

## 背景

项目技术栈：

- Expo SDK 55
- React Native 0.83.2
- NativeWind 4.2.3
- pnpm

在一次实时语音能力开发后，页面样式突然退化成“只有少量背景色，主体几乎全是裸文本”的状态。

## 现象

页面表现：

- 只有外层少量 `StyleSheet` 样式能生效
- `className` 写的视觉样式基本不落屏
- 顶部 hero、圆角卡片、按钮、消息气泡都不出现

运行时日志：

```text
[nativewind] verifyInstallation failed
Your 'metro.config.js' has overridden the 'config.resolver.resolveRequest'
config setting in a non-composable manner...
```

这条报错非常关键。它不是普通警告，而是 NativeWind 在告诉我们：

- JSX pragma 已经走到了检查逻辑
- 但 `react-native-css-interop` 的 poison pill 拦截没有成功
- 最终导致样式数据注入链断掉

## 第一阶段的误判

在真正定位前，先后出现过几种误判：

### 1. 误以为是页面代码没写样式

不是。

页面里已经写了大量静态 `className`，例如：

- `bg-orange-400`
- `rounded-[32px]`
- `border border-amber-200`
- `bg-amber-50`
- `bg-rose-500`

所以问题不在“样式没写”，而在“样式管线没真正跑通”。

### 2. 误以为是动态 token 拼接导致全部失效

项目里确实有过这种不稳写法：

```ts
`bg-${token}`
`text-${token}`
`border-${token}`
```

这类写法对 Tailwind / NativeWind 的静态提取不友好，属于真实隐患。

但它不是这次“页面几乎完全失效”的唯一主因。因为即便改成静态类名，`verifyInstallation` 还是会报错。

### 3. 误以为另一轮修复没有生效

这是本次排查里最容易浪费时间的一点。

后面虽然已经修掉了一部分依赖问题，但如果继续用旧 Metro 缓存或旧 bundle 做验证，页面看起来仍然像“没修好”。

也就是说：

- 有一部分问题被修掉了
- 但验证链路还在吃旧缓存
- 于是人会以为“修复无效”

## 最终确认的根因

这次问题实际上有两层。

### Layer 1：`react-native-css-interop` 被手动声明为直接依赖

`nativewind` 内部已经依赖 `react-native-css-interop`。

如果项目又在 `package.json` 里手动声明：

```json
"react-native-css-interop": "^0.2.3"
```

在 pnpm 默认的 isolated 安装模式下，就可能出现多个实例。

结果是：

- Metro 配置阶段挂上的 resolver
- 和运行时 bundle 真正 `require("./interop-poison.pill")` 用到的实例

不是同一个实例上下文。

这会直接导致：

- poison pill 拦截失效
- `require("./interop-poison.pill") === false`
- `verifyInstallation()` 抛出 `resolveRequest non-composable` 错误

### Layer 2：pnpm isolated 模式加剧了路径不稳定

pnpm isolated 模式下，`node_modules` 里大量包是 symlink。

Metro 跟随 symlink 后，路径可能变成：

- `node_modules/react-native-css-interop/...`

也可能变成：

- `node_modules/.pnpm/react-native-css-interop@.../node_modules/react-native-css-interop/...`

这会进一步放大“注册 resolver 的实例”和“运行时实际解析的实例”不一致的问题。

### Layer 3：验证阶段被 Metro / bundle 缓存误导

这层不是根因，但它让问题显得“怎么修都没用”。

我们后面确认过：

- `.cache/android.js` 已经开始正常生成
- sourcemap 里已经能看到 NativeWind 编译产物

但页面还是旧样子。

真正原因是：

- 当时 app 仍在吃旧的 Metro / bundle 缓存
- 并没有真正验证到“修复后的最新打包结果”

这一步如果不清掉，会让人以为前面的修复全部失败。

## 关键证据链

### 1. 运行时报错

出现：

```text
[nativewind] verifyInstallation failed
... resolveRequest ... non-composable manner
```

### 2. `react-native-css-interop` 存在多实例

可在仓库中看到多个安装路径：

- `node_modules/react-native-css-interop/...`
- `node_modules/.pnpm/react-native-css-interop@.../...`

这与“多实例冲突”判断一致。

### 3. `.cache/android.js` 曾经是空文件

在未修复依赖前，`react-native-css-interop/.cache/android.js` 一度是 `0` 字节。

这说明 NativeWind 编译产物本身就没有被稳定生成。

### 4. 修复依赖后，`android.js` 开始生成真实内容

后续再次检查时，`android.js` 已经是非空文件，并且能看到：

```text
flags:{...,nativewind:"true"}
```

这说明样式编译链已经前进了一步。

### 5. 清掉 Metro 缓存后，日志变成成功

最终用清缓存方式重新起 Metro 后，日志变为：

```text
NativeWind verifyInstallation() found no errors
```

这是本次问题真正“过线”的标志。

## 最终修复方案

### 1. 移除直接依赖冲突

从 `package.json` 删除：

```json
"react-native-css-interop"
```

只保留：

```json
"nativewind"
```

### 2. 使用 hoisted 安装模式

新增 `.npmrc`：

```ini
node-linker=hoisted
```

目标是降低 Metro 在 symlink 跟随上的不稳定性。

### 3. 保持 NativeWind Expo 接法完整

关键文件需保持一致：

- `babel.config.js`
- `metro.config.js`
- `tailwind.config.js`
- `global.css`
- `tsconfig.json`
- `App.tsx`

### 4. 页面层尽量使用静态 `className`

避免再次回到这类动态拼接：

```ts
`bg-${token}`
`text-${token}`
`border-${token}`
```

更稳的方式是：

- 直接写静态类名
- 或用静态映射表
- `StyleSheet` 只做极少数原生阴影、平台差异等极端补位

### 5. 验证时必须清掉 Metro 缓存

这是这次排查里最容易被忽略的点。

不能只改依赖然后直接看旧页面。

必须重新起一个清缓存的 Metro：

```bash
pnpm exec expo start --dev-client --clear --port 8081
```

然后再让 Android app 重新连到这个 Metro。

## 本次真正有效的验证顺序

### 静态验证

```bash
pnpm exec tsc --noEmit
pnpm run test --runInBand
```

### 运行时验证

1. 启动清缓存后的 Metro：

```bash
pnpm exec expo start --dev-client --clear --port 8081
```

2. 重新拉起 Android app，让它连接新的 Metro

3. 观察日志，确认出现：

```text
NativeWind verifyInstallation() found no errors
```

4. 再看实际页面是否出现：

- 顶部橙色 hero
- 状态卡片
- 胶囊按钮
- 底部输入区

如果只看到“淡色背景 + 裸文本”，通常还不能算通过。

## 本次问题里最重要的教训

### 1. 不要手动再装 NativeWind 的内部关键依赖

尤其是：

- `react-native-css-interop`

除非官方明确要求直接安装，否则优先跟随 `nativewind` 自带依赖关系。

### 2. 用 pnpm + Metro + NativeWind 时，要警惕多实例与 symlink 路径

只看 `package.json` 很容易误判。  
要结合：

- 实际 `node_modules` 路径
- bundle sourcemap
- 运行时日志

一起判断。

### 3. “修复没生效”很多时候其实是验证链路在吃旧缓存

这次最耗时的不是根因本身，而是：

- 代码变了
- 依赖变了
- 但验证环境还是旧的

所以以后遇到 Metro / NativeWind / Expo bundling 类问题，优先把 `--clear` 纳入标准动作。

### 4. 验证标准不能只看配置文件，要看运行时结果

真正过线的信号不是“配置看起来对了”，而是：

- `verifyInstallation()` 不再报错
- 页面样式真实落屏

## 后续建议

后续如果再出现类似问题，按下面顺序排查：

1. 看运行时是否有 `verifyInstallation failed`
2. 检查 `package.json` 是否又手动引入了 `react-native-css-interop`
3. 检查 `.npmrc` 是否仍是 `node-linker=hoisted`
4. 检查页面是否用了大量动态 Tailwind 类名拼接
5. 用 `expo start --dev-client --clear` 重新起 Metro
6. 再看日志是否变成：

```text
NativeWind verifyInstallation() found no errors
```

## 关联文件

- [/Users/david/Documents/github/my-doubao/package.json](/Users/david/Documents/github/my-doubao/package.json)
- [/Users/david/Documents/github/my-doubao/.npmrc](/Users/david/Documents/github/my-doubao/.npmrc)
- [/Users/david/Documents/github/my-doubao/metro.config.js](/Users/david/Documents/github/my-doubao/metro.config.js)
- [/Users/david/Documents/github/my-doubao/tailwind.config.js](/Users/david/Documents/github/my-doubao/tailwind.config.js)
- [/Users/david/Documents/github/my-doubao/global.css](/Users/david/Documents/github/my-doubao/global.css)
- [/Users/david/Documents/github/my-doubao/App.tsx](/Users/david/Documents/github/my-doubao/App.tsx)
- [/Users/david/Documents/github/my-doubao/src/features/voice-assistant/ui/VoiceAssistantScreen.tsx](/Users/david/Documents/github/my-doubao/src/features/voice-assistant/ui/VoiceAssistantScreen.tsx)
- [/Users/david/Documents/github/my-doubao/src/app/theme/mappers.ts](/Users/david/Documents/github/my-doubao/src/app/theme/mappers.ts)
