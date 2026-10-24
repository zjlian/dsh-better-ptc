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

import type { Context } from '@deepseek-ai/cordis'
import { createUserMessage } from '@deepseek-ai/dsh-llm'
import type { CommandInvocation, CommandResult } from '@deepseek-ai/dsh-commands'
import { expandCommandTemplate } from './expand.ts'
import { parseCommandText, type CommandFile, type FileIo } from './discover.ts'

/** One effective snapshot of a command file, for change detection. */
interface RegistrationSnapshot {
  readonly path: string
  readonly description: string
  readonly argumentHint: string | undefined
}

/** What a sync pass changed. */
export interface SyncReport {
  readonly added: readonly string[]
  readonly replaced: readonly string[]
  readonly removed: readonly string[]
}

/** Registry-facing options. */
export interface RegistrationOptions {
  readonly io: FileIo
  readonly maxFileBytes: number
}

/** Durable source identity for one expanded command prompt. */
export interface CommandExpansionSource {
  readonly kind: 'command-expansion'
  readonly command: string
  readonly path: string
}

declare module '@deepseek-ai/dsh-llm' {
  interface MessageSourceMap {
    'command-expansion': CommandExpansionSource
  }
}

/**
 * Owns every `ctx.commands` registration this feature made. `sync` is
 * idempotent; a later discovery pass that promotes a project file over a
 * user file of the same name replaces the registration in place.
 */
export class CommandRegistrations {
  private readonly registered = new Map<string, { dispose(): void; snapshot: RegistrationSnapshot }>()

  constructor(
    private readonly ctx: Context,
    private readonly options: RegistrationOptions,
  ) {}

  /**
   * Align the registrations with one effective command set.
   * @param effective - winning command file per name.
   * @returns what this pass added, replaced, and removed.
   */
  sync(effective: ReadonlyMap<string, CommandFile>): SyncReport {
    const added: string[] = []
    const replaced: string[] = []
    const removed: string[] = []
    for (const [name, file] of effective) {
      const snapshot: RegistrationSnapshot = { path: file.path, description: file.description, argumentHint: file.argumentHint }
      const existing = this.registered.get(name)
      if (existing !== undefined && sameSnapshot(existing.snapshot, snapshot)) continue
      if (existing !== undefined) {
        existing.dispose()
        this.registered.delete(name)
      }
      try {
        const dispose = this.ctx.commands.register({
          name,
          description: file.description,
          input: { hint: file.argumentHint ?? '<args>' },
          handler: (invocation: CommandInvocation): CommandResult | Promise<CommandResult> => this.invoke(file, invocation),
        })
        this.registered.set(name, { dispose, snapshot })
        if (existing !== undefined) replaced.push(name)
        else added.push(name)
      } catch (error: unknown) {
        this.ctx.logger.warn(`ptc-commands: skipped command "${name}" (${file.path}): ${errorMessage(error)}`)
      }
    }
    for (const [name, entry] of this.registered) {
      if (effective.has(name)) continue
      entry.dispose()
      this.registered.delete(name)
      removed.push(name)
    }
    return { added, replaced, removed }
  }

  /** Dispose every registration this instance made. */
  dispose(): void {
    for (const [, entry] of this.registered) entry.dispose()
    this.registered.clear()
  }

  /**
   * Re-read the file, expand it against the typed arguments, and submit the
   * expanded prompt as the receiving agent's next user message.
   * @param file - the winning command file for this name.
   * @param invocation - the registry's execution invocation.
   * @returns the settled command result.
   */
  private async invoke(file: CommandFile, invocation: CommandInvocation): Promise<CommandResult> {
    const text = await this.options.io.readText(file.path, this.options.maxFileBytes)
    const parsed = text === undefined ? undefined : parseCommandText(text)
    if (parsed === undefined || parsed.template.length === 0) {
      return { kind: 'error', text: `command file missing, unreadable, or empty: ${file.path}` }
    }
    const expanded = expandCommandTemplate(parsed.template, invocation.rawInput)
    invocation.agent.steer(createUserMessage({
      content: [{ type: 'text', text: expanded }],
      source: { kind: 'command-expansion', command: file.name, path: file.path },
    }))
    return { kind: 'success' }
  }
}

function sameSnapshot(left: RegistrationSnapshot, right: RegistrationSnapshot): boolean {
  return left.path === right.path && left.description === right.description && left.argumentHint === right.argumentHint
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
