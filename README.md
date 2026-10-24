# dsh-better-ptc

> Workflow upgrades for DeepSeek Harness **PTC mode**: Claude-Code-style markdown slash commands, plus automatic in-place repair of failing `run_code` calls.

中文用户:本插件给 DSH 的 PTC 模式增加「markdown 文件即斜杠命令」与 `run_code` 自动修复两个能力,安装方式见下。

[![DSH](https://img.shields.io/badge/DSH-%3E%3D0.2.1--rc.3-blue)](#requirements)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Features

- **Markdown slash commands** — drop a `.md` file into a `commands/` directory, get a `/command`. Claude Code compatible: frontmatter metadata, `$ARGUMENTS` templating, project-over-user shadowing, optional `.claude/commands/` interop.
- **`run_code` auto-repair** — when a PTC `run_code` call is rejected before execution (compile error, missing `description`), one auxiliary model call fixes it and the program reruns inside the same tool call, instead of burning a full retry round-trip.

Both features ride one host-global loader row. Commands appear in the `/` menu of sessions whose agent preset is listed in the config (default: **PTC only**); other modes are not touched.

## Requirements

- DeepSeek Harness **≥ 0.2.1-rc.3, < 0.3.0** (enforced by `engines.dsh` as a SemVer range; older versions are not supported).

## Installation

```bash
git clone https://github.com/zjlian/dsh-better-ptc.git
```

1. Open DSH and go to the plugin manager.
2. Install the bundle from the cloned directory (`dsh-better-ptc`).
3. Restart DSH.

pnpm will warn that the linked package's peer dependencies are not resolved — that is expected; the harness routes them at runtime (see [How it works](#how-it-works)).

## Slash commands

### Quick start

Create `~/.agents/commands/deploy.md`:

```markdown
---
description: Deploy the current branch to staging
argument-hint: [env]
---
Deploy the current branch to the $ARGUMENTS environment.
Run the test suite first; abort and report if it fails.
```

Open a PTC-mode session, type `/deploy`, press <kbd>Enter</kbd>.

### Where command files are read from

| Scope | Directory | Notes |
|---|---|---|
| Project | `.agents/commands/` | Highest precedence |
| Project | `.dsh/commands/` | |
| User | `~/.agents/commands/` | Scanned at startup |
| User | `~/.dsh/commands/` | |
| Opt-in | `.claude/commands/` + `~/.claude/commands/` | Enable with [`includeClaudeDirs`](#commands) |

Project roots are found by walking up from the nearest `.git`; project directories are discovered lazily as qualifying sessions appear. A command defined in both scopes resolves to the **project** one.

### File format

```markdown
---
description: One-line summary shown in the / menu
argument-hint: [file] [mode]   # ghost text after the command name
---
Body sent as your message. Reference the whole argument string with
$ARGUMENTS, or the Nth word (0-based, quote-split) with $ARGUMENTS[N] or $N.
Escape a literal dollar sign with \$.
```

- **Command name** = the file's relative path, kebab-cased, subdirectories joined with `-` (`frontend/component.md` → `/frontend-component`). The name must start with a lowercase letter, matching DSH's command grammar.
- If the body contains no placeholder but you pass arguments, the input is appended as `ARGUMENTS: <input>`.
- Frontmatter keys beyond `description` / `argument-hint` (e.g. `allowed-tools`, `model`) are recognized but ignored, with a warning.
- Execution runs on the UI command plane: the `/name args` line itself never enters the model context; the expanded body is submitted as the session's next user message.

## `run_code` auto-repair

Repairs two classes of pre-execution rejection, in place:

1. **Compile errors** — the program is rejected by the PTC type-stripping phase (`syntax error`, non-erasable TypeScript syntax). One auxiliary model call rewrites it into a compilable equivalent, then it reruns in the same tool call.
2. **Missing `description`** — the registry rejects the call because only `{code}` was passed. One auxiliary call writes the description, then it reruns.

Both defects present: the program is fixed first, then the description is written for the fixed program (at most two auxiliary calls, one repair record, one rerun).

Repair claims a call only under the runtime contract its preflight mirrors: a TypeScript runtime whose `programFormat` is `function-body` (the default Node PTC runtime; DSH ≥ 0.2.1-rc.3 reports this property). The persistent-in-memory REPL format and other languages keep the baseline path.

Guarantees: repairs rewrite only the **model-visible history** (message projection). The durable session log keeps the original call plus an ignorable `plugin:ptc-repair/*` audit record. Any step failing falls back to the original error path — the feature can never make a session worse.

## Configuration

Configure in the bundle's loader row (`cordis.patch.yml`); config is optional, keyed per feature, unknown keys are rejected.

### `repair` (global entry `better-ptc`)

| Key | Default | Description |
|---|---|---|
| `timeoutMs` | `20000` | Auxiliary repair call deadline (ms) |
| `maxOutputTokens` | `4096` | Output cap for the auxiliary call |
| `maxCodeGrowth` | `2` | Max length of a repaired program relative to the rejected one |
| `provider` + `model` | session route | Auxiliary-call route override; must be set together |

### `commands` (same global entry `better-ptc`)

| Key | Default | Description |
|---|---|---|
| `enabled` | `true` | Mount the feature at all |
| `presets` | `['ptc']` | Agent preset ids whose sessions receive the commands |
| `projectCommandDirs` | `.agents/commands`, `.dsh/commands` | Project-relative roots, precedence order |
| `userCommandDirs` | `~/.agents/commands`, `~/.dsh/commands` | Absolute or `~`-relative |
| `includeClaudeDirs` | `false` | Also scan `.claude/commands/` dirs |
| `maxDepth` | `2` | Max subdirectory depth below a command root |
| `maxFileBytes` | `65536` | Max bytes read from one file; larger files are skipped |

Example:

```yaml
- insert:
    - id: better-ptc
      name: dsh-better-ptc
      config:
        repair:
          timeoutMs: 30000
        commands:
          presets: [ptc, my-custom-preset]
```

## How it works

- Host-only Cordis bundle with **one** fixed loader row, `better-ptc`. Both features mount behind it; the patch file never changes with DSH versions.
- The `commands` feature is preset-gated per agent, not per composition: it reads each agent's live preset id from the preset registry (`ctx.agentPresets.composedPreset`) and registers the effective commands through that agent's own context, so they land in the agent's command layer — visible exactly to agents of the configured presets, shadowing same-name global commands. A blank session switching presets is re-evaluated on its `agent-preset/selected` event, so the menu follows the switch immediately. (Earlier releases instead overrode the shipped `preset-ptc` row with a verbatim copy of its plugin list, which had to be re-copied on every DSH upgrade.)
- The `repair` feature is a plain global `tools/execute` waterfall listener plus a session message projection; it claims a call only when the mounted PTC runtime reports TypeScript in `function-body` format.
- The six `@deepseek-ai/dsh-*` packages in `peerDependencies` are routed to the DSH installation by the host's linked-root resolution intercept — that is why the exact peer list matters and pnpm's warning is safe to ignore. `engines.dsh` carries the actual admission check.

## Development

The package is type-checked and tested inside a DSH source checkout:

```bash
# 1. Mirror src/ into packages/experimental/ptc-repair/ of the checkout
# 2. Build (use --force whenever the file set changed; stale tsbuildinfo
#    silently skips new files)
pnpm exec tsc -b --force
# 3. Test
pnpm exec vitest run packages/experimental/ptc-repair/tests
# 4. Copy lib/types/** (both .js and .d.ts, exclude *.map) and the
#    lib/index.js stub back into this repo, then reinstall the bundle
```

**Upgrading the supported DSH range** is now mostly a review task: re-verify the consumed APIs against the new source (`engines.dsh`, the `peerDependencies` list, and the two mirrors below) and bump `engines.dsh`. The only verbatim mirrors of DSH internals are the PTC type-strip wrapper in `features/repair/preflight.ts` (a drift degrades repair to baseline, never misrepairs) and the plugin-record vocabulary in `features/repair/records.ts`.

## Limitations

- Plugin-registered commands render in the `/` menu without leading icons and in the built-in Commands section — `CommandDescriptor` has no icon field. Per-command icons need an upstream DSH extension.
- Repair never touches runtime exceptions, nested `run_code` calls, or non-`function-body` program formats; a repaired program must stay within `maxCodeGrowth`.
- Command mounts are created when a session is created or first emits an event; a session restored before the plugin activates is picked up at feature mount.

## License

[MIT](LICENSE)
