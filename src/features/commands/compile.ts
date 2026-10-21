/**
 * Pure precedence merge for discovered command files. Project files shadow
 * user files of the same name outright; within one class the first file in
 * discovery order wins. Every shadowed file is reported so the feature can log
 * what the user is not getting.
 *
 * @module dsh-better-ptc/features/commands/compile
 */

import type { CommandFile } from './discover.ts'

/** One shadowed same-name file, with the definition that won. */
export interface ShadowNote {
  readonly name: string
  readonly winner: CommandFile
  readonly loser: CommandFile
}

/** The effective command set plus everything it shadowed. */
export interface CompiledCommands {
  /** Winning command file per command name, insertion-ordered. */
  readonly effective: ReadonlyMap<string, CommandFile>
  /** Same-name files shadowed by an earlier or higher-precedence file. */
  readonly shadows: readonly ShadowNote[]
}

/**
 * Merge discovered command files into one effective set.
 * @param project - project-root files in discovery order (higher precedence).
 * @param user - user-root files in discovery order (lower precedence).
 * @returns the effective map and the shadowing report.
 */
export function compile(project: readonly CommandFile[], user: readonly CommandFile[]): CompiledCommands {
  const effective = new Map<string, CommandFile>()
  const shadows: ShadowNote[] = []
  for (const file of project) insert(effective, shadows, file)
  for (const file of user) insert(effective, shadows, file)
  return { effective, shadows }
}

function insert(effective: Map<string, CommandFile>, shadows: ShadowNote[], file: CommandFile): void {
  const winner = effective.get(file.name)
  if (winner === undefined) {
    effective.set(file.name, file)
    return
  }
  shadows.push({ name: file.name, winner, loser: file })
}
