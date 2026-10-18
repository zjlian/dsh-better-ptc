/**
 * PTC repair experiment: a focused auxiliary model call repairs a `run_code`
 * program that the Node PTC runtime rejected before execution, and a second one
 * supplies the required `description` argument when the registry rejected the
 * call's arguments before the program could run. A registered message
 * projection replaces the rejected call's arguments in the model-visible
 * assistant message, and the repaired call is re-run inside the same tool call.
 * When anything in the repair path fails, the call keeps its baseline behavior
 * (the original arguments run and their failure reaches the model unchanged).
 *
 * The plugin needs no core change: `run_code` is a normal tool execution, the
 * repair record is an ignorable `plugin:` record, and the rewrite is a
 * fiber-owned message projection.
 * @module @deepseek-ai/dsh-ptc-repair
 */
import type { Context } from '@deepseek-ai/cordis';
import { Config } from './config.ts';
export { Config };
export type { Config as PtcRepairConfig } from './config.ts';
/** Cordis plugin name used by loader diagnostics. */
export declare const name = "ptc-repair";
/** The services the repair path uses: the auxiliary model, session store, and tool registry. */
export declare const inject: string[];
/**
 * Register the repair listener and its message projection.
 * @param ctx - plugin context owning the listener and projection.
 * @param raw - loader-validated plugin configuration.
 */
export declare function apply(ctx: Context, raw?: Config): void;
//# sourceMappingURL=index.d.ts.map