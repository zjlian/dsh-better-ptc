/**
 * Host-side argument preflight for a model-direct `run_code` call. The registry
 * validates a typed tool's arguments before its body runs, so a call whose
 * `description` is missing, mistyped, or blank never executes the program. A
 * repair may supply that one argument; every other violation keeps the baseline
 * failure, because inventing a program or rewriting unrelated control arguments
 * is outside a repair's authority.
 * @module @deepseek-ai/dsh-ptc-repair/arguments
 */

import { assertObjectJsonSchema, validateJsonSchemaValue } from '@deepseek-ai/dsh-tools'
import type { JsonSchemaNode } from '@deepseek-ai/dsh-tools'

/** A repairable argument failure: the schema it was measured against and its violations. */
export interface ArgumentFailure {
  /** The complete model-facing parameter schema the violations were computed against. */
  readonly schema: JsonSchemaNode
  /** The description violations, in schema-walk order; empty for a blank description. */
  readonly violations: readonly string[]
}

/**
 * Determine whether one call's arguments are invalid only in its `description`.
 * The check runs before the registry validates the call, so it sees exactly the
 * arguments the tool body would reject. Repairability is decided behaviorally:
 * supplying a well-formed placeholder description must clear every violation,
 * which keeps this plugin independent of the validator's message wording.
 * Repair stays narrow on purpose: the generated value is one short description,
 * and no other argument may be rewritten.
 * @param parameters - the tool's current model-facing parameter schema.
 * @param args - the parsed arguments the registry is about to validate.
 * @returns the repairable failure, or `undefined` when the arguments are valid
 *   or another argument is invalid too.
 */
export function preflightArguments(parameters: unknown, args: unknown): ArgumentFailure | undefined {
  let schema: JsonSchemaNode
  try {
    assertObjectJsonSchema(parameters)
    schema = parameters
  } catch {
    // An unreadable schema cannot define a repairable failure; keep baseline.
    return undefined
  }
  const violations = validateJsonSchemaValue(schema, args, '')
  if (violations.length === 0) return blankDescription(args) ? { schema, violations } : undefined
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return undefined
  const probed = validateJsonSchemaValue(schema, { ...args, description: PROBE_DESCRIPTION }, '')
  return probed.length === 0 ? { schema, violations } : undefined
}

/** A description that satisfies any schema the argument accepts as a string. */
const PROBE_DESCRIPTION = '_'

/**
 * Validate a repaired argument object against the schema the original
 * violations were measured with, so a candidate the registry would still
 * reject is never committed to history.
 * @param schema - the schema from {@link preflightArguments}.
 * @param args - the candidate argument object.
 * @returns violations; empty means the registry accepts the candidate.
 */
export function violationsOf(schema: JsonSchemaNode, args: unknown): readonly string[] {
  return validateJsonSchemaValue(schema, args, '')
}

/** Whether the arguments passed schema validation but their description is only whitespace. */
function blankDescription(args: unknown): boolean {
  if (typeof args !== 'object' || args === null || Array.isArray(args)) return false
  const description = (args as Record<string, unknown>)['description']
  return typeof description === 'string' && description.trim().length === 0
}
