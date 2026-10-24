/**
 * Filesystem discovery for markdown command files, behind an injected `FileIo`
 * seam: production runs the host-filesystem adapter, tests run an in-memory
 * map. One command root is scanned to a bounded depth; every file's frontmatter
 * is parsed for `description` and `argument-hint`, and the body becomes the
 * command template. Names derive from the file's path segments below the root,
 * kebab-cased and joined with `-` (the DSH command grammar has no `:`).
 *
 * @module dsh-better-ptc/features/commands/discover
 */

import { readdir, readFile, stat } from 'node:fs/promises'
import { join, sep } from 'node:path'

/** One directory listing entry, normalized across the seam. */
export interface DirEntry {
  readonly name: string
  readonly isDirectory: boolean
}

/**
 * Injected filesystem seam. Absent paths read as an empty listing and an
 * absent text; the caller reports them as warnings.
 */
export interface FileIo {
  /** List one directory; an absent or unreadable directory reads as empty. */
  readDir(path: string): Promise<readonly DirEntry[]>
  /** Read one UTF-8 text file, or `undefined` when absent, unreadable, or over `maxBytes`. */
  readText(path: string, maxBytes: number): Promise<string | undefined>
}

/** A scanned command directory with its precedence class. */
export interface CommandRoot {
  /** Absolute directory path. */
  readonly path: string
  /** Precedence class: project files shadow user files of the same name. */
  readonly scope: 'project' | 'user'
}

/** One parsed command file ready for registration. */
export interface CommandFile {
  /** Derived command name (kebab-cased path below the root). */
  readonly name: string
  /** Menu description; synthesized when the frontmatter omits one. */
  readonly description: string
  /** Optional autocomplete hint from `argument-hint` frontmatter. */
  readonly argumentHint: string | undefined
  /** Body below the frontmatter, trimmed. */
  readonly template: string
  /** Absolute file path, re-read on every invocation. */
  readonly path: string
  /** Precedence class of the root that supplied the file. */
  readonly scope: 'project' | 'user'
  /** Frontmatter keys this bundle reads but does not act on. */
  readonly ignoredFrontmatter: readonly string[]
}

/** Root scan outcome: parsed commands plus human-readable warnings. */
export interface DiscoverResult {
  readonly commands: readonly CommandFile[]
  readonly warnings: readonly string[]
}

/** Budgets the scan honors. */
export interface DiscoverOptions {
  readonly maxDepth: number
  readonly maxFileBytes: number
}

/** Host-filesystem adapter: node fs reads with absent paths reading empty. */
export const nodeFileIo: FileIo = {
  async readDir(path) {
    try {
      const entries = await readdir(path, { withFileTypes: true })
      const result: DirEntry[] = []
      for (const entry of entries) {
        if (entry.isDirectory()) {
          result.push({ name: entry.name, isDirectory: true })
          continue
        }
        if (entry.isSymbolicLink()) {
          try {
            result.push({ name: entry.name, isDirectory: (await stat(join(path, entry.name))).isDirectory() })
          } catch {
            result.push({ name: entry.name, isDirectory: false })
          }
          continue
        }
        result.push({ name: entry.name, isDirectory: false })
      }
      return result
    } catch {
      // An absent or unreadable root is an expected empty scan, not a failure.
      return []
    }
  },
  async readText(path, maxBytes) {
    try {
      const content = await readFile(path, { encoding: 'utf8' })
      if (Buffer.byteLength(content, 'utf8') > maxBytes) return undefined
      return content
    } catch {
      return undefined
    }
  },
}

/**
 * Walk one command root and parse every markdown file it holds.
 * @param root - the directory and precedence class to scan.
 * @param io - filesystem seam.
 * @param options - depth and size budgets.
 * @returns parsed commands in deterministic walk order, plus warnings.
 */
export async function discoverRoot(root: CommandRoot, io: FileIo, options: DiscoverOptions): Promise<DiscoverResult> {
  const commands: CommandFile[] = []
  const warnings: string[] = []
  await walk(root, io, options, root.path, 0, commands, warnings)
  return { commands, warnings }
}

/** One directory level: sorted entries, subdirectories before flat files. */
async function walk(
  root: CommandRoot,
  io: FileIo,
  options: DiscoverOptions,
  directory: string,
  depth: number,
  commands: CommandFile[],
  warnings: string[],
): Promise<void> {
  const entries = [...await io.readDir(directory)].sort((left, right) => left.name.localeCompare(right.name))
  for (const entry of entries) {
    const path = join(directory, entry.name)
    if (entry.isDirectory) {
      if (depth < options.maxDepth) await walk(root, io, options, path, depth + 1, commands, warnings)
      continue
    }
    if (!entry.name.toLowerCase().endsWith('.md')) continue
    await readCommandFile(root, io, options, directory, path, entry.name, commands, warnings)
  }
}

/** Parse one candidate file into a CommandFile, or warn and skip it. */
async function readCommandFile(
  root: CommandRoot,
  io: FileIo,
  options: DiscoverOptions,
  directory: string,
  path: string,
  fileName: string,
  commands: CommandFile[],
  warnings: string[],
): Promise<void> {
  const text = await io.readText(path, options.maxFileBytes)
  if (text === undefined) {
    warnings.push(`command file missing, unreadable, or over ${options.maxFileBytes} bytes: ${path}`)
    return
  }
  const parsed = parseCommandText(text)
  if (parsed === undefined || parsed.template.length === 0) {
    warnings.push(`command file has no body after frontmatter: ${path}`)
    return
  }
  const name = commandName(root.path, directory, fileName)
  if (name === undefined) {
    warnings.push(`command file name has no usable characters: ${path}`)
    return
  }
  for (const key of parsed.ignoredFrontmatter) {
    warnings.push(`command "${name}" ignores unsupported frontmatter key "${key}" (${path})`)
  }
  commands.push({
    name,
    description: parsed.description ?? `Custom command from ${path}`,
    argumentHint: parsed.argumentHint,
    template: parsed.template,
    path,
    scope: root.scope,
    ignoredFrontmatter: parsed.ignoredFrontmatter,
  })
}

/**
 * Kebab-case a path below the root into the command-name grammar, or `undefined`.
 * The grammar mirrors the command registry's own rule (a leading lowercase
 * letter, then lowercase letters, digits, `_`, `-`), so a name the registry
 * would reject is skipped at discovery instead of thrown at registration.
 */
function commandName(rootPath: string, directory: string, fileName: string): string | undefined {
  const relative = directory === rootPath ? fileName : `${directory.slice(rootPath.length + 1)}${sep}${fileName}`
  const segments = relative.split(/[\\/]/)
  segments[segments.length - 1] = segments[segments.length - 1]!.replace(/\.md$/i, '')
  const name = segments.map(kebab).filter(segment => segment.length > 0).join('-')
  return /^[a-z][a-z0-9_-]*$/.test(name) ? name : undefined
}

/** Lowercase and collapse every character the command grammar rejects. */
function kebab(segment: string): string {
  return segment.toLowerCase().replaceAll(/[^a-z0-9_-]+/g, '-').replaceAll(/^-+|-+$/g, '')
}

/** Parsed command-file content between (and excluding) the frontmatter markers. */
export interface ParsedCommandText {
  readonly description: string | undefined
  readonly argumentHint: string | undefined
  readonly template: string
  readonly ignoredFrontmatter: readonly string[]
}

/** Frontmatter keys this bundle acts on. */
const USED_KEYS = new Set(['description', 'argument-hint'])

/**
 * Parse one command file's text: optional `---` frontmatter with flat
 * `key: value` lines, then the template body.
 * @param text - the complete file content.
 * @returns the parsed fields, or `undefined` when no body follows.
 */
export function parseCommandText(text: string): ParsedCommandText | undefined {
  const lines = text.split('\n')
  let start = 0
  const fields = new Map<string, string>()
  if (lines[0]?.replace(/\r$/, '') === '---') {
    let close = 1
    while (close < lines.length && lines[close]?.replace(/\r$/, '') !== '---') close += 1
    if (close < lines.length) {
      for (let index = 1; index < close; index += 1) {
        const match = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec((lines[index] ?? '').replace(/\r$/, ''))
        if (match !== null) fields.set(match[1]!, unquote(match[2] ?? ''))
      }
      start = close + 1
    }
  }
  const template = lines.slice(start).join('\n').trim()
  return {
    description: nonEmpty(fields.get('description')),
    argumentHint: nonEmpty(fields.get('argument-hint')),
    template,
    ignoredFrontmatter: [...fields.keys()].filter(key => !USED_KEYS.has(key)),
  }
}

/** Strip one balanced pair of matching quotes around a scalar value. */
function unquote(value: string): string {
  const trimmed = value.trim()
  if (trimmed.length >= 2 && ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"')))) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

function nonEmpty(value: string | undefined): string | undefined {
  const trimmed = value?.trim()
  return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed
}
