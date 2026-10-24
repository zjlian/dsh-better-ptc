/**
 * The `commands` feature: loads markdown command files from user-global roots
 * at mount and from project roots lazily as sessions appear, and registers
 * each effective command for exactly the agents whose preset id is listed in
 * the feature config (`presets`, default `ptc`). A command runs in the UI
 * command plane; its handler expands the file's template against the typed
 * arguments and submits the result as the agent's next user message, matching
 * the Claude Code / OpenCode `commands/` behavior. Precedence: project files
 * shadow user files of the same name, and these agent-layer registrations
 * shadow same-name global commands.
 *
 * The feature rides the bundle's single global host row and never touches any
 * shipped preset row: it reads each agent's live preset from the preset
 * registry and registers through that agent's own context, so the
 * registrations land in the agent's command layer — visible exactly to that
 * agent. This replaces the earlier verbatim override of the shipped `ptc`
 * preset row, which had to be re-copied onto every DSH upgrade.
 *
 * @module dsh-better-ptc/features/commands
 */
import type { Context } from '@deepseek-ai/cordis';
import type { Feature } from '../../support/entry.ts';
import { Config } from './config.ts';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "ptc-commands";
/**
 * The services the feature requires: the command registry, per-agent working
 * directories, and the agent registry. The preset registry is read
 * optionally (`ctx.get`): a composition without presets has no session the
 * feature could serve, and requiring it would also block this row's other
 * features in such profiles.
 */
export declare const inject: string[];
/**
 * Register the command-file discovery, the preset-gated per-agent command
 * mounts, and the lazy project-root discovery driven by qualifying sessions.
 * @param ctx - the mounting global entry context.
 * @param raw - loader-validated feature configuration.
 */
export declare function apply(ctx: Context, raw?: Config): void;
/** The commands feature mounted by the global host entry. */
export declare const commands: Feature;
//# sourceMappingURL=index.d.ts.map
