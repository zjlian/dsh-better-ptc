/**
 * Registry adapter: keeps the `ctx.commands` registrations of this feature in
 * sync with one effective command set. Registrations go through the mounting
 * (preset-scoped) context, so the traceable `ctx.commands` service binds
 * `this.ctx` to that context and every registration lands in the preset's
 * scope layer — visible exactly to that preset's agents, shadowing same-name
 * global commands. Changed files re-register in place; the diff is reported so
 * the feature can log what moved.
 *
 * @module dsh-better-ptc/features/commands/register
 */
import { createUserMessage } from '@deepseek-ai/dsh-llm';
import { expandCommandTemplate } from "./expand.js";
import { parseCommandText } from "./discover.js";
/**
 * Owns every `ctx.commands` registration this feature made. `sync` is
 * idempotent; a later discovery pass that promotes a project file over a
 * user file of the same name replaces the registration in place.
 */
export class CommandRegistrations {
    ctx;
    options;
    registered = new Map();
    constructor(ctx, options) {
        this.ctx = ctx;
        this.options = options;
    }
    /**
     * Align the registrations with one effective command set.
     * @param effective - winning command file per name.
     * @returns what this pass added, replaced, and removed.
     */
    sync(effective) {
        const added = [];
        const replaced = [];
        const removed = [];
        for (const [name, file] of effective) {
            const snapshot = { path: file.path, description: file.description, argumentHint: file.argumentHint };
            const existing = this.registered.get(name);
            if (existing !== undefined && sameSnapshot(existing.snapshot, snapshot))
                continue;
            if (existing !== undefined) {
                existing.dispose();
                this.registered.delete(name);
            }
            try {
                const dispose = this.ctx.commands.register({
                    name,
                    description: file.description,
                    input: { hint: file.argumentHint ?? '<args>' },
                    handler: (invocation) => this.invoke(file, invocation),
                });
                this.registered.set(name, { dispose, snapshot });
                if (existing !== undefined)
                    replaced.push(name);
                else
                    added.push(name);
            }
            catch (error) {
                this.ctx.logger.warn(`ptc-commands: skipped command "${name}" (${file.path}): ${errorMessage(error)}`);
            }
        }
        for (const [name, entry] of this.registered) {
            if (effective.has(name))
                continue;
            entry.dispose();
            this.registered.delete(name);
            removed.push(name);
        }
        return { added, replaced, removed };
    }
    /** Dispose every registration this instance made. */
    dispose() {
        for (const [, entry] of this.registered)
            entry.dispose();
        this.registered.clear();
    }
    /**
     * Re-read the file, expand it against the typed arguments, and submit the
     * expanded prompt as the receiving agent's next user message.
     * @param file - the winning command file for this name.
     * @param invocation - the registry's execution invocation.
     * @returns the settled command result.
     */
    async invoke(file, invocation) {
        const text = await this.options.io.readText(file.path, this.options.maxFileBytes);
        const parsed = text === undefined ? undefined : parseCommandText(text);
        if (parsed === undefined || parsed.template.length === 0) {
            return { kind: 'error', text: `command file missing, unreadable, or empty: ${file.path}` };
        }
        const expanded = expandCommandTemplate(parsed.template, invocation.rawInput);
        invocation.agent.steer(createUserMessage({
            content: [{ type: 'text', text: expanded }],
            source: { kind: 'command-expansion', command: file.name, path: file.path },
        }));
        return { kind: 'success' };
    }
}
function sameSnapshot(left, right) {
    return left.path === right.path && left.description === right.description && left.argumentHint === right.argumentHint;
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=register.js.map