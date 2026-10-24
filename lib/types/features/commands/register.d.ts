/**
 * Registry adapter: keeps the `ctx.commands` registrations of one mounted
 * agent in sync with one effective command set. Registrations go through the
 * mounting (agent-scoped) context, so the traceable `ctx.commands` service
 * binds `this.ctx` to that context and every registration lands in the
 * agent's own scope layer — visible exactly to that agent, shadowing
 * same-name global commands. Changed files re-register in place; the diff is
 * reported so the feature can log what moved.
 *
 * @module dsh-better-ptc/features/commands/register
 */
import type { Context } from '@deepseek-ai/cordis';
import { type CommandFile, type FileIo } from './discover.ts';
/** What a sync pass changed. */
export interface SyncReport {
    readonly added: readonly string[];
    readonly replaced: readonly string[];
    readonly removed: readonly string[];
}
/** Registry-facing options. */
export interface RegistrationOptions {
    readonly io: FileIo;
    readonly maxFileBytes: number;
}
/** Durable source identity for one expanded command prompt. */
export interface CommandExpansionSource {
    readonly kind: 'command-expansion';
    readonly command: string;
    readonly path: string;
}
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        'command-expansion': CommandExpansionSource;
    }
}
/**
 * Owns every `ctx.commands` registration this feature made. `sync` is
 * idempotent; a later discovery pass that promotes a project file over a
 * user file of the same name replaces the registration in place.
 */
export declare class CommandRegistrations {
    private readonly ctx;
    private readonly options;
    private readonly registered;
    constructor(ctx: Context, options: RegistrationOptions);
    /**
     * Align the registrations with one effective command set.
     * @param effective - winning command file per name.
     * @returns what this pass added, replaced, and removed.
     */
    sync(effective: ReadonlyMap<string, CommandFile>): SyncReport;
    /** Dispose every registration this instance made. */
    dispose(): void;
    /**
     * Re-read the file, expand it against the typed arguments, and submit the
     * expanded prompt as the receiving agent's next user message.
     * @param file - the winning command file for this name.
     * @param invocation - the registry's execution invocation.
     * @returns the settled command result.
     */
    private invoke;
}
//# sourceMappingURL=register.d.ts.map