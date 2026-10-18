# dsh-better-ptc

让 DSH（DeepSeek Harness）PTC 模式的 `run_code` 调用在两类"必然失败"上**就地自愈**，省掉模型来回重试烧掉的上下文与缓存费用：

1. **程序编译错误** —— 程序在 PTC runtime type-strip 阶段就被拒绝（`syntax error`、不可擦除语法），从未执行。一次辅助模型调用把程序改写为同义的可编译版本，然后在同一个 tool call 里重跑。
2. **缺 `description` 参数** —— 模型只传了 `{code}`，registry 参数校验直接拒绝（`Error: invalid arguments: missing required property "description"`），程序从未执行。一次辅助模型调用为程序写一行 description，补全参数后重跑。两种缺陷同时存在时，先修程序、再描述修好后的程序（最多两次辅助调用，仍只写一条修复记录、只重跑一次）。

修复通过 DSH 0.2.1 的 message projection 只改写**模型可见历史**：模型下一次请求看到的是"自己一开始就写对了"的调用，不再出现失败往返；durable 会话日志保持原样（写入 ignorable 的 `plugin:ptc-repair/*` 审计记录，含每次辅助调用的 usage）。任一步失败（辅助调用失败、答案被拒、无路由等）都回退为原始行为：错误原样上抛给模型，与未安装本插件完全一致。

## 安装

**DSH 客户端（推荐）**：打开插件管理面板 → 安装，在"包名或地址"里粘贴：

```
https://github.com/zjlian/dsh-better-ptc.git
```

- 要求 DSH 运行时为 `0.2.1-rc.2`（`package.json` 的 `engines.dsh` 已精确钉住；其它版本需要自行重建，见下文）。
- 安装即启用，HMR 生效，无需重启。
- 包无安装脚本、无运行时第三方依赖。

**CLI 等价**（非 desktop profile，或已退出应用时）：

```sh
dsh plugin --profile <profile> add https://github.com/zjlian/dsh-better-ptc.git
```

## 触发条件与边界

- 只处理 model-direct 的 `run_code` 调用（无 parent token），且挂载的 PTC runtime 语言为 TypeScript。
- 参数修复只接管"全部违规都指向 `description`"（缺失 / 类型错 / 纯空白字符串）的调用；`code` 缺失、`timeoutMs` 等其它参数违规不修。
- 编译修复只修语法 / 类型剥离错误：提示词钉死"保持行为、控制流、工具调用与返回值不变"，修复结果必须通过同一预检，长度默认上限为原程序 2 倍。
- 生成的 description 是一行 ≤200 字符的纯文本；候选参数在重跑前会再用当前 `run_code` schema 复核一遍。
- **不修**：运行期异常（可能已有副作用，重跑不安全）；PTC 程序内嵌套子调用缺参数（那种情况的报错形态是 `Error: code run failed (exception): ...`）；非 TypeScript 后端。
- 辅助调用路由默认使用该会话自己记录的 provider/model（`request/header`），也可在行 `config` 里成对指定 `provider`/`model`。
- 辅助调用的 token 消耗不进 `token-meter`，只记录在 `plugin:ptc-repair/repair` 的 `usage` 字段里。
- UI 的人类转录仍显示原始调用与最终结果（projection 只影响模型可见历史）。

## 配置（可选，全部有默认值）

```yaml
- id: better-ptc
  name: dsh-better-ptc
  config:
    timeoutMs: 20000        # 每次辅助调用的超时（毫秒）
    maxOutputTokens: 4096   # 每次辅助调用的输出 token 上限
    maxCodeGrowth: 2        # 修复后程序相对原程序的最大长度倍数（>1）
    # provider: <provider>  # 与 model 成对出现，指定辅助调用的路由
    # model: <model>
```

## 卸载

插件管理面板移除该 bundle，或 `dsh plugin --profile <profile> remove dsh-better-ptc`。
注意：写过修复记录的会话在插件被卸载的同一个进程里会拒绝继续派生（保护性行为）；卸载后重启 DSH 最稳妥，stock 读取器会把这些记录当作未知 ignorable 事件跳过，历史退回原始参数。

## 从源码构建

本插件在 DSH 源码树内开发与测试（依赖 workspace 解析与内部包类型）：

```sh
git clone --depth 1 -b dsh-v0.2.1-rc.2 https://github.com/deepseek-ai/deepseek-harness.git
cd deepseek-harness && pnpm install --ignore-scripts
# 把本仓库 src/ 放到 packages/experimental/ptc-repair/src/，并按该树的
# packages/experimental 约定补上 tsconfig.json / package.json，然后：
pnpm exec tsc -b packages/experimental/ptc-repair/tsconfig.json
cd packages/experimental/ptc-repair
pnpm exec tsdown lib/types/index.js --no-config --format esm --platform node \
  --target es2024 --out-dir lib --no-clean --no-dts
Move-Item lib/index.mjs lib/index.js   # 产物提交回本仓库
```

更换 DSH 版本时：对照目标 tag 重建并同步 `engines.dsh`。源码树内测试（25 个 vitest 用例，含 6 个真实组装的端到端流程用例）位于开发树的 `packages/experimental/ptc-repair/tests/`。

## English summary

A DSH bundle that auto-repairs PTC `run_code` calls in place: TypeScript compile-stage program errors and the missing required `description` argument are each fixed by one focused auxiliary model call, the model-visible history is rewritten through a session message projection, and the call is re-run under the same id — no model retry round-trip. Runtime errors are never replayed; every failure falls back to the stock behavior. Pinned to DSH `0.2.1-rc.2` via `engines.dsh`.

## License

MIT
