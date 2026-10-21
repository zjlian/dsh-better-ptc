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
/** One directory listing entry, normalized across the seam. */
export interface DirEntry {
    readonly name: string;
    readonly isDirectory: boolean;
}
/**
 * Injected filesystem seam. Absent paths read as an empty listing and an
 * absent text; the caller reports them as warnings.
 */
export interface FileIo {
    /** List one directory; an absent or unreadable directory reads as empty. */
    readDir(path: string): Promise<readonly DirEntry[]>;
    /** Read one UTF-8 text file, or `undefined` when absent, unreadable, or over `maxBytes`. */
    readText(path: string, maxBytes: number): Promise<string | undefined>;
}
/** A scanned command directory with its precedence class. */
export interface CommandRoot {
    /** Absolute directory path. */
    readonly path: string;
    /** Precedence class: project files shadow user files of the same name. */
    readonly scope: 'project' | 'user';
}
/** One parsed command file ready for registration. */
export interface CommandFile {
    /** Derived command name (kebab-cased path below the root). */
    readonly name: string;
    /** Menu description; synthesized when the frontmatter omits one. */
    readonly description: string;
    /** Optional autocomplete hint from `argument-hint` frontmatter. */
    readonly argumentHint: string | undefined;
    /** Body below the frontmatter, trimmed. */
    readonly template: string;
    /** Absolute file path, re-read on every invocation. */
    readonly path: string;
    /** Precedence class of the root that supplied the file. */
    readonly scope: 'project' | 'user';
    /** Frontmatter keys this bundle reads but does not act on. */
    readonly ignoredFrontmatter: readonly string[];
}
/** Root scan outcome: parsed commands plus human-readable warnings. */
export interface DiscoverResult {
    readonly commands: readonly CommandFile[];
    readonly warnings: readonly string[];
}
/** Budgets the scan honors. */
export interface DiscoverOptions {
    readonly maxDepth: number;
    readonly maxFileBytes: number;
}
/** Host-filesystem adapter: node fs reads with absent paths reading empty. */
export declare const nodeFileIo: FileIo;
/**
 * Walk one command root and parse every markdown file it holds.
 * @param root - the directory and precedence class to scan.
 * @param io - filesystem seam.
 * @param options - depth and size budgets.
 * @returns parsed commands in deterministic walk order, plus warnings.
 */
export declare function discoverRoot(root: CommandRoot, io: FileIo, options: DiscoverOptions): Promise<DiscoverResult>;
/** Parsed command-file content between (and excluding) the frontmatter markers. */
export interface ParsedCommandText {
    readonly description: string | undefined;
    readonly argumentHint: string | undefined;
    readonly template: string;
    readonly ignoredFrontmatter: readonly string[];
}
/**
 * Parse one command file's text: optional `---` frontmatter with flat
 * `key: value` lines, then the template body.
 * @param text - the complete file content.
 * @returns the parsed fields, or `undefined` when no body follows.
 */
export declare function parseCommandText(text: string): ParsedCommandText | undefined;
//# sourceMappingURL=discover.d.ts.map