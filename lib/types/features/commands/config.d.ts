/**
 * Configuration for the `commands` feature: which directories are scanned for
 * markdown command files and the discovery budgets. The plugin declares its own
 * standard-schema config so a profile can install the bundle without a
 * schemastery dependency; validation stays fail-loud at load.
 *
 * @module dsh-better-ptc/features/commands/config
 */
/** User-facing `commands` feature configuration. */
export interface Config {
    /** Whether the feature mounts at all (default true). */
    enabled?: boolean;
    /**
     * Project-relative command directories under the discovered project root,
     * highest precedence first. Defaults to `.agents/commands` then `.dsh/commands`.
     */
    projectCommandDirs?: string[];
    /**
     * User-global command directories. Absolute, or `~`-relative. Defaults to
     * `~/.agents/commands` and `~/.dsh/commands` resolved from the harness homes.
     */
    userCommandDirs?: string[];
    /** Also scan `.claude/commands` (project) and `~/.claude/commands` (user) for Claude Code interop (default false). */
    includeClaudeDirs?: boolean;
    /** Maximum subdirectory depth below a command root (default 2, minimum 0). */
    maxDepth?: number;
    /** Maximum UTF-8 bytes read from one command file; larger files are skipped with a warning (default 65536). */
    maxFileBytes?: number;
}
/** Validated configuration with every default resolved. */
export interface ResolvedConfig {
    readonly enabled: boolean;
    readonly projectDirs: readonly string[];
    readonly userDirs: readonly string[];
    readonly maxDepth: number;
    readonly maxFileBytes: number;
}
/** The minimal standard-schema contract Cordis validates plugin config with. */
interface StandardSchema<T> {
    readonly '~standard': {
        readonly version: 1;
        readonly vendor: string;
        readonly validate: (value: unknown) => {
            readonly value: T;
        } | {
            readonly issues: readonly {
                readonly message: string;
            }[];
        };
    };
}
/** Compile the standard-schema projection Cordis resolves before `apply` runs. */
export declare const Config: StandardSchema<Config>;
/**
 * Resolve and validate the feature configuration.
 * @param config - raw feature configuration.
 * @returns a detached, deeply immutable configuration.
 * @throws when a directory entry is empty, absolute where relative is required,
 *   or a budget is not a positive integer.
 */
export declare function resolveConfig(config?: Config): ResolvedConfig;
export {};
//# sourceMappingURL=config.d.ts.map