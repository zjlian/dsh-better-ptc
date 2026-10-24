/**
 * Host-side compile preflight for a `run_code` program. The Node PTC runtime
 * type-strips a program under a fixed async-function wrapper before it spawns a
 * process, so a program that fails the strip provably never executes: repairing
 * it cannot duplicate tool side effects. The wrapper below must match the
 * runtime's own wrapper.
 * @module @deepseek-ai/dsh-ptc-repair/preflight
 */

import { stripTypeScriptTypes } from 'node:module'

/**
 * The wrapper the Node PTC runtime strips a program under
 * (`STRIP_PREFIX`/`STRIP_SUFFIX` in `ptc-runtime-node`). Preflight must use the
 * identical wrapper so a program that passes here also passes the runtime's own
 * strip, and so top-level `await`/`return` are legal. Verified identical from
 * 0.2.1-rc.2 through 0.2.1-rc.3; a drift makes repairs fail acceptance
 * (`still-invalid`) and fall back to baseline rather than misrepair.
 */
const STRIP_WRAP = { prefix: 'async function __dsh_program__() {\n', suffix: '\n}' } as const

/** Diagnostic detail for a program the type-strip rejected. */
export interface CompileFailure {
  /** The engine's message (no location; Node keeps location in the stack). */
  readonly message: string
  /**
   * A bounded excerpt of the engine stack holding the offending source frame
   * and caret, when the engine supplied one. Line numbers are relative to the
   * wrapped program (one wrapper line precedes the program's first line).
   */
  readonly frame?: string
}

/**
 * Determine whether a program survives the exact type-strip the runtime applies
 * before execution.
 * @param program - the model-authored TypeScript program body.
 * @returns `undefined` when the program compiles, otherwise its diagnostic.
 */
export function preflightProgram(program: string): CompileFailure | undefined {
  try {
    stripTypeScriptTypes(STRIP_WRAP.prefix + program + STRIP_WRAP.suffix)
    return undefined
  } catch (error: unknown) {
    if (!(error instanceof Error)) return { message: String(error) }
    const frame = stackFrame(error)
    return frame === undefined ? { message: error.message } : { message: error.message, frame }
  }
}

/**
 * Keep the leading stack frames that carry the rejected source lines. Node's
 * strip diagnostics put the offending lines and caret before the `SyntaxError`
 * header; later frames name Harness internals and are noise for a repair model.
 * @param error - the engine's strip failure.
 * @returns the bounded source-frame excerpt, or `undefined` when absent.
 */
function stackFrame(error: Error): string | undefined {
  const stack = error.stack
  if (stack === undefined) return undefined
  const lines = stack.split('\n')
  const header = lines.findIndex(line => line.includes('SyntaxError'))
  const excerpt = (header === -1 ? lines : lines.slice(0, header)).slice(0, 8)
  const text = excerpt.join('\n').trim()
  return text.length === 0 ? undefined : text
}
