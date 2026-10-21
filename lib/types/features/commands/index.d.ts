/**
 * The `commands` feature: loads markdown command files from user-global roots
 * at mount and from project roots lazily, as sessions of the mounting preset
 * appear, and registers each effective command on `ctx.commands`. A command
 * runs in the UI command plane; its handler expands the file's template
 * against the typed arguments and submits the result as the agent's next user
 * message, matching the Claude Code / OpenCode `commands/` behavior.
 * Precedence: project files shadow user files of the same name, and this
 * feature's preset-layer registrations shadow same-name global commands.
 *
 * @module dsh-better-ptc/features/commands
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Feature } from '../../support/entry.ts';
import { Config } from './config.ts';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "ptc-commands";
/** The services the feature reads: the command registry, per-agent working directories, and the agent registry. */
export declare const inject: string[];
/**
 * Register the command-file discovery, the registry sync, and the lazy
 * project-root discovery driven by this preset's sessions.
 * @param ctx - the mounting (preset-scoped) entry context.
 * @param raw - loader-validated feature configuration.
 */
export declare function apply(ctx: Context, raw?: Config): void;
/** The commands feature mounted by the preset host entry. */
export declare const commands: Feature;
//# sourceMappingURL=index.d.ts.map