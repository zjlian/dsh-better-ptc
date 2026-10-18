/**
 * Host-side argument preflight for a model-direct `run_code` call. The registry
 * validates a typed tool's arguments before its body runs, so a call whose
 * `description` is missing, mistyped, or blank never executes the program. A
 * repair may supply that one argument; every other violation keeps the baseline
 * failure, because inventing a program or rewriting unrelated control arguments
 * is outside a repair's authority.
 * @module @deepseek-ai/dsh-ptc-repair/arguments
 */
import type { JsonSchemaNode } from '@deepseek-ai/dsh-tools';
/** A repairable argument failure: the schema it was measured against and its violations. */
export interface ArgumentFailure {
    /** The complete model-facing parameter schema the violations were computed against. */
    readonly schema: JsonSchemaNode;
    /** The description violations, in schema-walk order; empty for a blank description. */
    readonly violations: readonly string[];
}
/**
 * Determine whether one call's arguments are invalid only in its `description`.
 * The check runs before the registry validates the call, so it sees exactly the
 * arguments the tool body would reject. Repairability is narrow on purpose: the
 * generated value is one short description, and only violations naming that
 * argument can be resolved by it.
 * @param parameters - the tool's current model-facing parameter schema.
 * @param args - the parsed arguments the registry is about to validate.
 * @returns the repairable failure, or `undefined` when the arguments are valid
 *   or another argument is invalid too.
 */
export declare function preflightArguments(parameters: unknown, args: unknown): ArgumentFailure | undefined;
/**
 * Validate a repaired argument object against the schema the original
 * violations were measured with, so a candidate the registry would still
 * reject is never committed to history.
 * @param schema - the schema from {@link preflightArguments}.
 * @param args - the candidate argument object.
 * @returns violations; empty means the registry accepts the candidate.
 */
export declare function violationsOf(schema: JsonSchemaNode, args: unknown): readonly string[];
//# sourceMappingURL=arguments.d.ts.map