# dsh-better-ptc

一个装在 DSH（DeepSeek Harness）里的**个人工作流工具箱** bundle:一个包、两个固定挂载入口,内部按 feature 组织,加新功能不再改 patch。

| 入口 | loader 行 | 作用域 | 挂载的 feature |
|---|---|---|---|
| `.` (`lib/index.js`) | `better-ptc`(全局) | host 全局层 | `repair` — PTC `run_code` 就地自愈 |
| `./preset` (`lib/preset.js`) | `better-ptc-preset`(追加进**自带 `ptc` preset** 的插件列表) | ptc preset 作用域层 | `commands` — markdown 斜杠命令 |

纯宿主插件,无浏览器半。命令经 `ctx.commands.register` 注册,在 `/` 菜单里与内置命令同处「指令」分栏——这是宿主命令的默认呈现,本 bundle 不做任何 UI 定制(图标/分栏等呈现增强需要 DSH 上游给 `CommandDescriptor` 加图标或分栏字段,曾用 `dsh.client` + DOM hack 尝试过,因对抗平台设计已于 0.3.0 移除)。

本 bundle **按行 id override shipped `preset-ptc` 行**:loader 语义是 `config` 整体替换(不深合并),因此内容 = shipped `ptc` preset 插件列表逐字副本 + 追加固定的 `better-ptc-preset` 行。preset 定义 id 保持 `ptc`——**不新增模式、不改变默认选择**,装上后自带的 PTC 模式直接多出 commands 能力。整棵 loader 树的模块解析锚点是 profile 目录(本包经 node_modules link 在那里可解析),子行 `dsh-better-ptc/preset` 因此可导入。

**注意**:运行时导入的 `@deepseek-ai/dsh-*` 家族包必须声明在本包 `package.json` 的 `peerDependencies` 里(dsh-scope、dsh-session、dsh-llm、dsh-timeout、dsh-tools、dsh-util-values、dsh-home-paths)——link 安装的真实路径不在任何 node_modules 链上,宿主的运行时解析拦截按**本包 manifest 声明的 peer 名单**把家族包路由到 DSH 安装;漏声明即 `Cannot find package '@deepseek-ai/...'`。新增家族导入时记得同步。

## Feature: `repair`(run_code 就地自愈,原 0.1.0 行为不变)

让 PTC 模式的 `run_code` 调用在两类"必然失败"上**就地自愈**,省掉模型来回重试烧掉的上下文与缓存费用:

1. **程序编译错误** —— 程序在 PTC runtime type-strip 阶段就被拒绝(`syntax error`、不可擦除语法),从未执行。一次辅助模型调用把程序改写为同义的可编译版本,然后在同一个 tool call 里重跑。
2. **缺 `description` 参数** —— 模型只传了 `{code}`,registry 参数校验直接拒绝。一次辅助模型调用为程序写一行 description,补全参数后重跑。两种缺陷同时存在时,先修程序、再描述修好后的程序(最多两次辅助调用,仍只写一条修复记录、只重跑一次)。

修复通过 message projection 只改写**模型可见历史**;durable 会话日志保持原样(写入 ignorable 的 `plugin:ptc-repair/*` 审计记录)。任一步失败都回退为原始行为。

## Feature: `commands`(PTC 模式会话的 markdown 斜杠命令)

Claude Code / OpenCode 风格:一个 markdown 文件 = 一条 `/命令`。**只在 PTC 模式的会话里出现**(挂载在 ptc preset 作用域层,其它模式的 `/` 菜单完全看不到)。想让别的模式也用:在本 bundle 的 `cordis.patch.yml` 里照 `preset-ptc` 的样子再加一个 override 行,把 `better-ptc-preset` 行追加进那个 preset 的插件列表。

### 扫描目录

- 用户级:`~/.agents/commands/`、`~/.dsh/commands/`(挂载即扫描)
- 项目级:`<项目根>/.agents/commands/`、`<项目根>/.dsh/commands/`(项目根按 `.git` 向上查找;该 ptc 会话的首个事件触发懒发现)
- 两个开关可选加入 `.claude/commands/` 与 `~/.claude/commands/`(Claude Code 互操作)

### 文件格式

```markdown
---
description: 部署当前分支到 staging
argument-hint: [env]
---
把当前分支部署到 $ARGUMENTS 环境,先跑测试,失败则中止并报告。
```

- **命令名** = 文件相对路径 kebab 化、子目录用 `-` 连接(`frontend/component.md` → `/frontend-component`;DSH 命令名语法不允许 `:`);下划线保留。
- **参数替换**(对齐 Claude Code):`$ARGUMENTS` = 完整参数原文;`$ARGUMENTS[N]` / `$N` = 按引号切分后的第 N 个参数(0 基,未匹配保持字面);`\$` 转义;正文没有任何占位符且用户带了参数时,尾部追加 `ARGUMENTS: <input>`。
- frontmatter 只消费 `description`、`argument-hint`;`allowed-tools`、`model`、`context` 等已知但不支持的字段会 warn 并忽略。
- 执行:命令在 UI 命令平面运行(`/名字 参数` 本身不进模型上下文,`command/run` 记录原文),handler 重读文件、展开模板后把结果作为该会话的下一条用户消息提交(source 为 `command-expansion`,会话日志可追溯)。

### 优先级(同名遮蔽)

1. **项目级 > 用户级**(项目文件直接遮蔽同名用户文件,日志报告遮蔽);
2. **本插件(preset 层)> DSH 全局命令**(`/compact` `/model` `/plan` 等,作用域层就近遮蔽——即项目里放一个 `model.md` 可以改掉 ptc 会话的 `/model`);
3. 两个不同项目根同名:先发现者胜(多项目 ptc 会话并存时菜单互见,执行时重读文件,所指非当前项目时报错,安全)。

### 配置(preset 行 `config.commands.*`,全部有默认值)

```yaml
- id: better-ptc-preset
  name: dsh-better-ptc/preset
  config:
    commands:
      enabled: true                          # 停用整个 commands 特性
      projectCommandDirs: ['.agents/commands', '.dsh/commands']
      userCommandDirs: ['~/.agents/commands', '~/.dsh/commands']
      includeClaudeDirs: false               # 追加 .claude/commands 互操作
      maxDepth: 2                            # 子目录深度
      maxFileBytes: 65536                    # 单文件上限,超出 warn 跳过
```

全局行同理:`config.repair.*` 对应原 `timeoutMs` / `maxOutputTokens` / `maxCodeGrowth` / `provider` / `model`(**注意:0.2.0 起 config 形状从平铺改为按 feature 分键**,未写显式 config 的用户无感)。

## 安装

**DSH 客户端(推荐)**:插件管理面板 → 安装,包名或地址粘贴:

```
https://github.com/zjlian/dsh-better-ptc.git
```

- 要求 DSH 运行时 `0.2.1-rc.2`(`engines.dsh` 钉死)。
- 安装即启用,**自带 PTC 模式直接增强**,不需要也不出现新的模式项;默认/已保存的 preset 选择全部保持不变。
- preset 变更不热更到已开的会话;增强后的 PTC 模式只影响之后新建的会话。安装/卸载涉及 preset 内插件时,管理器可能提示 restart-required,重启 DSH 即可。
- 卸载:面板移除或 `dsh plugin --profile <profile> remove dsh-better-ptc`;写过修复记录的会话见下文注意事项。

## 已知限制

- commands 只在**交互式**命令面(Web/CLI composer)可用;ACP 自动化无此表面。
- `!`cmd`` shell 预执行、`@file` 内联、`allowed-tools`/`model`/`context: fork` 等 Claude Code 扩展**不支持**(遇到会 warn)。
- 项目命令懒发现:全新 PTC 会话的 `/` 菜单要在会话产生第一个事件后才会包含项目级命令;文件内容修改在下一次扫描或执行时生效(执行总是重读文件)。
- preset 插件列表整表复制了 shipped ptc 的 plugins;升级 DSH 版本时需对照新列表同步 `cordis.patch.yml` 中的副本(以及 `peerDependencies`、`engines.dsh`)。
- 自定义命令在 `/` 菜单里与内置命令同列,无前置图标(宿主命令无图标字段);想要图标/独立分栏需 DSH 上游扩展,可另行提 issue/PR。
- repair 的原有边界(不修运行期异常、不修嵌套子调用、非 TypeScript 后端)不变。

## 从源码构建

本 bundle 在 DSH 源码树内开发与测试(开发树 `packages/experimental/ptc-repair/`,workspace 解析内部包类型):

```sh
git clone --depth 1 -b dsh-v0.2.1-rc.2 https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness && pnpm install --ignore-scripts
# 用本仓库 src/ 覆盖 packages/experimental/ptc-repair/src/,然后:
#   新增/删除源文件后必须删掉开发树里所有 *.tsbuildinfo 再编,否则增量编译
#   会认为"已是最新"而跳过,产物缺文件(踩过:lib/types/preset.js 缺失导致
#   preset 子行 never started)。
Get-ChildItem packages/experimental/ptc-repair -Recurse -Filter *.tsbuildinfo | Remove-Item   # Windows
pnpm exec tsc -b packages/experimental/ptc-repair/tsconfig.json
# 产物:lib/types/**(完整 ESM 文件树,含 .js 与 .d.ts——注意 .d.ts 的
# Extension 是 ".ts",拷贝过滤别用 ".d.ts" 字符串,会漏)。lib/index.js 与
# lib/preset.js 是两个薄 re-export 桩。把整棵 lib/types(排除 *.map)与两个桩
# 提交回本仓库即可。
```

测试(开发树内,52 个 vitest 用例 = 25 repair + 27 commands):

```sh
pnpm exec vitest run packages/experimental/ptc-repair/tests
```

更换 DSH 版本时:对照目标 tag 重建、同步 `engines.dsh` 与 `peerDependencies` 版本,并对照新 shipped ptc preset 列表同步 `cordis.patch.yml` 的副本。

## 加新 feature 的步骤(设计见仓库外设计文档第 9 节)

1. `src/features/<name>/` 写 Feature(`name`/`inject`/`Config`/`apply`,挂载失败只 warn 不拖垮别的 feature);
2. 在 `src/entries/global.ts` 或 `src/entries/preset.ts` 的特性表加一行(Config 自动聚合成 `{ <key>: {...} }`);
3. patch、preset 副本、package.json exports **都不用动**。只有新的挂载作用域才需要新入口行。

## English summary

A DSH personal-workflow toolbox bundle with two fixed host entries: the host-global `.` entry mounts the PTC `run_code` in-place auto-repair feature (unchanged since 0.1.0), and the `./preset` entry rides inside the shipped `ptc` agent preset — its row list is restated verbatim by id override with one fixed row appended — to provide Claude-Code-style markdown slash commands for PTC-mode sessions only, with `$ARGUMENTS`/`$N` expansion, `argument-hint` ghost text, project-over-user-over-builtin shadowing, and lazy per-project discovery. No new preset appears in the roster; the built-in PTC mode is simply extended. Runtime family imports are declared as `peerDependencies` so the host's linked-root resolution intercept routes them to the DSH installation. Config keys are per-feature; adding a feature never touches the loader patch. Pinned to DSH `0.2.1-rc.2`.

## License

MIT
