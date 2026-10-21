# dsh-better-ptc

> Workflow upgrades for DeepSeek Harness **PTC mode**: Claude-Code-style markdown slash commands, plus automatic in-place repair of failing `run_code` calls.

中文用户:本插件给 DSH 的 PTC 模式增加「markdown 文件即斜杠命令」与 `run_code` 自动修复两个能力,安装方式见下。

[![DSH](https://img.shields.io/badge/DSH-0.2.1--rc.2-blue)](#requirements)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

## Features

- **Markdown slash commands** — drop a `.md` file into a `commands/` directory, get a `/command`. Claude Code compatible: frontmatter metadata, `$ARGUMENTS` templating, project-over-user shadowing, optional `.claude/commands/` interop.
- **`run_code` auto-repair** — when a PTC `run_code` call is rejected before execution (compile error, missing `description`), one auxiliary model call fixes it and the program reruns inside the same tool call, instead of burning a full retry round-trip.

Both features are host-side only. Commands appear in the `/` menu of **PTC-mode sessions only**; no other mode is touched.

## Requirements

- DeepSeek Harness **0.2.1-rc.2** (exact version — enforced by `engines.dsh`, see [Limitations](#limitations)).

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

Project roots are found by walking up from the nearest `.git`; project directories are discovered lazily on the session's first event. A command defined in both scopes resolves to the **project** one.

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

- **Command name** = the file's relative path, kebab-cased, subdirectories joined with `-` (`frontend/component.md` → `/frontend-component`).
- If the body contains no placeholder but you pass arguments, the input is appended as `ARGUMENTS: <input>`.
- Frontmatter keys beyond `description` / `argument-hint` (e.g. `allowed-tools`, `model`) are recognized but ignored, with a warning.
- Execution runs on the UI command plane: the `/name args` line itself never enters the model context; the expanded body is submitted as the session's next user message.

## `run_code` auto-repair

Repairs two classes of pre-execution rejection, in place:

1. **Compile errors** — the program is rejected by the PTC type-stripping phase (`syntax error`, non-erasable TypeScript syntax). One auxiliary model call rewrites it into a compilable equivalent, then it reruns in the same tool call.
2. **Missing `description`** — the registry rejects the call because only `{code}` was passed. One auxiliary call writes the description, then it reruns.

Both defects present: the program is fixed first, then the description is written for the fixed program (at most two auxiliary calls, one repair record, one rerun).

Guarantees: repairs rewrite only the **model-visible history** (message projection). The durable session log keeps the original call plus an ignorable `plugin:ptc-repair/*` audit record. Any step failing falls back to the original error path — the feature can never make a session worse.

## Configuration

Configure in the bundle's loader rows (`cordis.patch.yml`); config is optional, keyed per feature, unknown keys are rejected.

### `repair` (global entry `better-ptc`)

| Key | Default | Description |
|---|---|---|
| `timeoutMs` | `20000` | Auxiliary repair call deadline (ms) |
| `maxOutputTokens` | `4096` | Output cap for the auxiliary call |
| `maxCodeGrowth` | `2` | Max length of a repaired program relative to the rejected one |
| `provider` + `model` | session route | Auxiliary-call route override; must be set together |

### `commands` (preset entry `better-ptc-preset`)

| Key | Default | Description |
|---|---|---|
| `enabled` | `true` | Mount the feature at all |
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
```

## How it works

- Host-only Cordis bundle with two fixed loader rows: `better-ptc` (global, `repair`) and `better-ptc-preset` (preset-scoped, `commands`). New features mount behind these rows without touching the patch again.
- The `commands` feature rides inside the **shipped `ptc` preset**: the bundle overrides the `preset-ptc` row by id, restating the shipped plugin list verbatim with one row appended. The definition id stays `ptc` — no new mode appears in the roster and default selections are unchanged. Because loader overrides replace `config` wholesale, this copy must track the shipped preset of the pinned DSH version.
- The preset entry registers commands via `ctx.commands.register` in the preset's scope layer, which is what makes them visible to PTC sessions only.
- The seven `@deepseek-ai/dsh-*` packages in `peerDependencies` are routed to the DSH installation by the host's linked-root resolution intercept — that is why the exact peer list matters and pnpm's warning is safe to ignore.

## Development

The package is type-checked and tested inside a DSH source checkout:

```bash
# 1. Mirror src/ into packages/experimental/ptc-repair/ of the checkout
# 2. Build (use --force whenever the file set changed; stale tsbuildinfo
#    silently skips new files)
pnpm exec tsc -b --force
# 3. Test
pnpm exec vitest run packages/experimental/ptc-repair/tests
# 4. Copy lib/types/** (both .js and .d.ts, exclude *.map) and the two
#    lib/*.js stubs back into this repo, then reinstall the bundle
```

**Upgrading the pinned DSH version** touches: the verbatim `preset-ptc` copy in `cordis.patch.yml` (re-diff against the new shipped `ptc.patch.yml`), `engines.dsh`, and the `peerDependencies` list.

## Limitations

- Plugin-registered commands render in the `/` menu without leading icons and in the built-in Commands section — `CommandDescriptor` has no icon field. Per-command icons need an upstream DSH extension.
- Repair never touches runtime exceptions, nested `run_code` calls, or non-TypeScript backends; a repaired program must stay within `maxCodeGrowth`.
- Commands are mounted PTC-mode-only by design; other presets would need another override row.
- The verbatim preset copy binds the bundle to the exact DSH version in `engines.dsh`.

## License

[MIT](LICENSE)
