/**
 * The `commands` feature: loads markdown command files from user-global roots
 * at mount and from project roots lazily, as sessions of the mounting preset
 * appear, and registers each effective command on `ctx.commands`. A command
 * runs in the UI command plane; its handler expands the file's template
 * against the typed arguments and submits the result as the agent's next user
 * message, matching the Claude Code / OpenCode `commands/` behavior.
 * Precedence: project files shadow user files of the same name, and this
 * feature's preset-layer registrations shadow same-name global commands.
 *
 * @module dsh-better-ptc/features/commands
 */

import type { Context } from '@deepseek-ai/cordis'
// Type-only: pulls the workingDirectory Context merge (ctx.workingDirectory).
import type {} from '@deepseek-ai/dsh-working-directory'
import { scopeChainOf, scopeOf } from '@deepseek-ai/dsh-scope'
import type { Agent } from '@deepseek-ai/dsh-agent'
import type { Session, SessionId } from '@deepseek-ai/dsh-session'
import { dirname, join } from 'node:path'
import type { Feature } from '../../support/entry.ts'
import { Config, resolveConfig } from './config.ts'
import { compile } from './compile.ts'
import { discoverRoot, nodeFileIo, type CommandFile, type CommandRoot } from './discover.ts'
import { CommandRegistrations } from './register.ts'

/** Cordis plugin name used by loader diagnostics. */
export const name = 'ptc-commands'

/** The services the feature reads: the command registry, per-agent working directories, and the agent registry. */
export const inject = ['commands', 'workingDirectory', 'agents']

/**
 * Register the command-file discovery, the registry sync, and the lazy
 * project-root discovery driven by this preset's sessions.
 * @param ctx - the mounting (preset-scoped) entry context.
 * @param raw - loader-validated feature configuration.
 */
export function apply(ctx: Context, raw: Config = {}): void {
  const config = resolveConfig(raw)
  if (!config.enabled) return
  const roots: CommandRoot[] = config.userDirs.map(path => ({ path, scope: 'user' as const }))
  const knownProjectRoots = new Set<string>()
  const seenSessions = new Set<string>()
  const registrations = new CommandRegistrations(ctx, { io: nodeFileIo, maxFileBytes: config.maxFileBytes })
  let syncing: Promise<void> | undefined

  const rescan = async (): Promise<void> => {
    const projectFiles: CommandFile[] = []
    const userFiles: CommandFile[] = []
    for (const root of roots) {
      const result = await discoverRoot(root, nodeFileIo, config)
      for (const warning of result.warnings) ctx.logger.warn(`ptc-commands: ${warning}`)
      const bucket = root.scope === 'project' ? projectFiles : userFiles
      bucket.push(...result.commands)
    }
    const compiled = compile(projectFiles, userFiles)
    for (const shadow of compiled.shadows) {
      ctx.logger.warn(`ptc-commands: command "${shadow.name}" from ${shadow.loser.path} is shadowed by ${shadow.winner.path}`)
    }
    const report = registrations.sync(compiled.effective)
    if (report.added.length + report.replaced.length + report.removed.length > 0) {
      ctx.logger.info(
        `ptc-commands: ${report.added.length} added, ${report.replaced.length} replaced, ${report.removed.length} removed`
        + ` (${[...compiled.effective.keys()].join(', ')})`,
      )
    }
  }

  const queueRescan = (): void => {
    syncing ??= rescan().catch((error: unknown) => {
      ctx.logger.warn(`ptc-commands: rescan failed: ${errorMessage(error)}`)
    }).finally(() => {
      syncing = undefined
    })
  }

  // User-global roots are cwd-independent: scan them once at mount.
  queueRescan()

  // Project roots depend on each session's working directory. The mounting
  // entry lives in the preset's standing composition, so session events from
  // this preset's agents (and only those, checked by scope chain) drive lazy
  // discovery; one rescan folds the new root into the effective set.
  ctx.on('session/event', (session: Session) => {
    if (seenSessions.has(session.id)) return
    seenSessions.add(session.id)
    void discoverProjectRoot(ctx, session.id, knownProjectRoots).then((root) => {
      if (root === undefined) return
      knownProjectRoots.add(root)
      for (const dir of config.projectDirs) roots.push({ path: join(root, dir), scope: 'project' })
      queueRescan()
    }).catch((error: unknown) => {
      ctx.logger.warn(`ptc-commands: project-root discovery failed for ${session.id}: ${errorMessage(error)}`)
    })
  })

  ctx.effect(() => () => registrations.dispose(), 'ptc-commands: registrations')
}

/**
 * Resolve one session's project root when the session belongs to this preset's
 * scope chain.
 * @param ctx - the mounting (preset-scoped) entry context.
 * @param sessionId - the session whose first event triggered discovery.
 * @param knownProjectRoots - roots already folded into the scan.
 * @returns the project root to scan, or `undefined` when there is nothing new.
 */
async function discoverProjectRoot(
  ctx: Context,
  sessionId: SessionId,
  knownProjectRoots: ReadonlySet<string>,
): Promise<string | undefined> {
  const agent = ctx.agents.get(sessionId)
  if (!inOwnScope(ctx, agent)) return undefined
  const cwd = await ctx.workingDirectory.ensure(agent)
  const root = await findProjectRoot(cwd)
  return knownProjectRoots.has(root) ? undefined : root
}

/** Whether the agent's context sits inside this feature's mounting scope. */
function inOwnScope(ctx: Context, agent: Agent | undefined): agent is Agent {
  if (agent === undefined) return false
  const own = scopeOf(ctx)
  return own === undefined || scopeChainOf(scopeOf(agent.ctx)).includes(own)
}

/** Walk upward from `cwd` to the closest `.git` marker, falling back to `cwd`. */
async function findProjectRoot(cwd: string): Promise<string> {
  let current = cwd
  while (true) {
    const entries = await nodeFileIo.readDir(current)
    if (entries.some(entry => entry.name === '.git')) return current
    const parent = dirname(current)
    if (parent === current) return cwd
    current = parent
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** The commands feature mounted by the preset host entry. */
export const commands: Feature = {
  name,
  inject,
  Config,
  apply: (ctx, raw) => apply(ctx, raw as Config),
}
