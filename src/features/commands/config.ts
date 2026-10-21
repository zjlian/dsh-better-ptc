/**
 * Configuration for the `commands` feature: which directories are scanned for
 * markdown command files and the discovery budgets. The plugin declares its own
 * standard-schema config so a profile can install the bundle without a
 * schemastery dependency; validation stays fail-loud at load.
 *
 * @module dsh-better-ptc/features/commands/config
 */

import { homedir } from 'node:os'
import { isAbsolute, join, resolve } from 'node:path'
import { resolveAgentsHome, resolveDshHome } from '@deepseek-ai/dsh-home-paths'

/** Default project-relative command directories, highest precedence first. */
const DEFAULT_PROJECT_DIRS = ['.agents/commands', '.dsh/commands'] as const
/** Claude Code project-relative command directory, opted in via `includeClaudeDirs`. */
const CLAUDE_PROJECT_DIR = '.claude/commands'
/** Default user-global command directory names under the shared agents/dsh homes. */
const DEFAULT_USER_DIR_NAMES = ['commands'] as const

/** User-facing `commands` feature configuration. */
export interface Config {
  /** Whether the feature mounts at all (default true). */
  enabled?: boolean
  /**
   * Project-relative command directories under the discovered project root,
   * highest precedence first. Defaults to `.agents/commands` then `.dsh/commands`.
   */
  projectCommandDirs?: string[]
  /**
   * User-global command directories. Absolute, or `~`-relative. Defaults to
   * `~/.agents/commands` and `~/.dsh/commands` resolved from the harness homes.
   */
  userCommandDirs?: string[]
  /** Also scan `.claude/commands` (project) and `~/.claude/commands` (user) for Claude Code interop (default false). */
  includeClaudeDirs?: boolean
  /** Maximum subdirectory depth below a command root (default 2, minimum 0). */
  maxDepth?: number
  /** Maximum UTF-8 bytes read from one command file; larger files are skipped with a warning (default 65536). */
  maxFileBytes?: number
}

/** Validated configuration with every default resolved. */
export interface ResolvedConfig {
  readonly enabled: boolean
  readonly projectDirs: readonly string[]
  readonly userDirs: readonly string[]
  readonly maxDepth: number
  readonly maxFileBytes: number
}

/** The minimal standard-schema contract Cordis validates plugin config with. */
interface StandardSchema<T> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (value: unknown) => { readonly value: T } | { readonly issues: readonly { readonly message: string }[] }
  }
}

/** Compile the standard-schema projection Cordis resolves before `apply` runs. */
export const Config: StandardSchema<Config> = {
  '~standard': {
    version: 1,
    vendor: 'ptc-commands',
    validate(value: unknown) {
      try {
        return { value: normalized(resolveConfig(value as Config)) }
      } catch (error: unknown) {
        return { issues: [{ message: error instanceof Error ? error.message : String(error) }] }
      }
    },
  },
}

/** Project resolved configuration back into the optional-field `Config` contract. */
function normalized(resolved: ResolvedConfig): Config {
  return {
    enabled: resolved.enabled,
    projectCommandDirs: [...resolved.projectDirs],
    userCommandDirs: [...resolved.userDirs],
    includeClaudeDirs: resolved.projectDirs.includes(CLAUDE_PROJECT_DIR),
    maxDepth: resolved.maxDepth,
    maxFileBytes: resolved.maxFileBytes,
  }
}

/**
 * Resolve and validate the feature configuration.
 * @param config - raw feature configuration.
 * @returns a detached, deeply immutable configuration.
 * @throws when a directory entry is empty, absolute where relative is required,
 *   or a budget is not a positive integer.
 */
export function resolveConfig(config: Config = {}): ResolvedConfig {
  const projectDirs = config.projectCommandDirs === undefined
    ? [...DEFAULT_PROJECT_DIRS]
    : [...config.projectCommandDirs]
  if (config.includeClaudeDirs === true) projectDirs.push(CLAUDE_PROJECT_DIR)
  for (const dir of projectDirs) validateRelativeDir('projectCommandDirs', dir)

  const userDirs = config.userCommandDirs === undefined
    ? defaultUserDirs()
    : config.userCommandDirs.map(expandHome)
  if (config.includeClaudeDirs === true) userDirs.push(join(homedir(), '.claude', 'commands'))
  for (const dir of userDirs) {
    if (dir.trim().length === 0) throw new Error('ptc-commands: userCommandDirs entries must be non-empty')
  }

  const maxDepth = config.maxDepth ?? 2
  if (!Number.isInteger(maxDepth) || maxDepth < 0) {
    throw new Error(`ptc-commands: maxDepth (${maxDepth}) must be an integer greater than or equal to 0`)
  }
  const maxFileBytes = config.maxFileBytes ?? 65_536
  if (!Number.isInteger(maxFileBytes) || maxFileBytes <= 0) {
    throw new Error(`ptc-commands: maxFileBytes (${maxFileBytes}) must be a positive integer`)
  }
  return Object.freeze({
    enabled: config.enabled ?? true,
    projectDirs: Object.freeze(projectDirs),
    userDirs: Object.freeze(userDirs.map(dir => resolve(dir))),
    maxDepth,
    maxFileBytes,
  })
}

/** Default user-global command roots: the shared agents home, then the dsh home. */
function defaultUserDirs(): string[] {
  return [
    join(resolveAgentsHome(), ...DEFAULT_USER_DIR_NAMES),
    join(resolveDshHome(), ...DEFAULT_USER_DIR_NAMES),
  ]
}

/** Expand a leading `~` against the OS home directory. */
function expandHome(dir: string): string {
  return dir === '~' || dir.startsWith('~/') || dir.startsWith('~\\')
    ? join(homedir(), dir.slice(1))
    : dir
}

/** Project directories must stay relative path segments below the project root. */
function validateRelativeDir(field: string, dir: string): void {
  if (dir.trim().length === 0) throw new Error(`ptc-commands: ${field} entries must be non-empty`)
  if (isAbsolute(dir)) throw new Error(`ptc-commands: ${field} entries must be relative (${dir} is absolute)`)
  if (dir.split(/[\\/]/).includes('..')) throw new Error(`ptc-commands: ${field} entries must not traverse upward (${dir})`)
}
