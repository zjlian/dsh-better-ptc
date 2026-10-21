/**
 * Host-side argument preflight for a model-direct `run_code` call. The registry
 * validates a typed tool's arguments before its body runs, so a call whose
 * `description` is missing, mistyped, or blank never executes the program. A
 * repair may supply that one argument; every other violation keeps the baseline
 * failure, because inventing a program or rewriting unrelated control arguments
 * is outside a repair's authority.
 * @module @deepseek-ai/dsh-ptc-repair/arguments
 */
import { assertObjectJsonSchema, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools';
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
export function preflightArguments(parameters, args) {
    let schema;
    try {
        assertObjectJsonSchema(parameters);
        schema = parameters;
    }
    catch {
        // An unreadable schema cannot define a repairable failure; keep baseline.
        return undefined;
    }
    const violations = validateJsonSchemaValue(schema, args, '');
    if (violations.length === 0)
        return blankDescription(args) ? { schema, violations } : undefined;
    return violations.every(isDescriptionViolation) ? { schema, violations } : undefined;
}
/**
 * Validate a repaired argument object against the schema the original
 * violations were measured with, so a candidate the registry would still
 * reject is never committed to history.
 * @param schema - the schema from {@link preflightArguments}.
 * @param args - the candidate argument object.
 * @returns violations; empty means the registry accepts the candidate.
 */
export function violationsOf(schema, args) {
    return validateJsonSchemaValue(schema, args, '');
}
/** The two schema violations a generated description can resolve. */
function isDescriptionViolation(violation) {
    return violation === 'missing required property "description"'
        || violation === '"description" must be a string';
}
/** Whether the arguments passed schema validation but their description is only whitespace. */
function blankDescription(args) {
    if (typeof args !== 'object' || args === null || Array.isArray(args))
        return false;
    const description = args['description'];
    return typeof description === 'string' && description.trim().length === 0;
}
//# sourceMappingURL=arguments.js.map