/**
 * Host-side compile preflight for a `run_code` program. The Node PTC runtime
 * type-strips a program under a fixed async-function wrapper before it spawns a
 * process, so a program that fails the strip provably never executes: repairing
 * it cannot duplicate tool side effects. The wrapper below must match the
 * runtime's own wrapper.
 * @module @deepseek-ai/dsh-ptc-repair/preflight
 */
/** Diagnostic detail for a program the type-strip rejected. */
export interface CompileFailure {
    /** The engine's message (no location; Node keeps location in the stack). */
    readonly message: string;
    /**
     * A bounded excerpt of the engine stack holding the offending source frame
     * and caret, when the engine supplied one. Line numbers are relative to the
     * wrapped program (one wrapper line precedes the program's first line).
     */
    readonly frame?: string;
}
/**
 * Determine whether a program survives the exact type-strip the runtime applies
 * before execution.
 * @param program - the model-authored TypeScript program body.
 * @returns `undefined` when the program compiles, otherwise its diagnostic.
 */
export declare function preflightProgram(program: string): CompileFailure | undefined;
//# sourceMappingURL=preflight.d.ts.map