/**
 * Configuration for the `commands` feature: which directories are scanned for
 * markdown command files and the discovery budgets. The plugin declares its own
 * standard-schema config so a profile can install the bundle without a
 * schemastery dependency; validation stays fail-loud at load.
 *
 * @module dsh-better-ptc/features/commands/config
 */
import { homedir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { resolveAgentsHome, resolveDshHome } from '@deepseek-ai/dsh-home-paths';
/** Default project-relative command directories, highest precedence first. */
const DEFAULT_PROJECT_DIRS = ['.agents/commands', '.dsh/commands'];
/** Claude Code project-relative command directory, opted in via `includeClaudeDirs`. */
const CLAUDE_PROJECT_DIR = '.claude/commands';
/** Default user-global command directory names under the shared agents/dsh homes. */
const DEFAULT_USER_DIR_NAMES = ['commands'];
/** Compile the standard-schema projection Cordis resolves before `apply` runs. */
export const Config = {
    '~standard': {
        version: 1,
        vendor: 'ptc-commands',
        validate(value) {
            try {
                return { value: normalized(resolveConfig(value)) };
            }
            catch (error) {
                return { issues: [{ message: error instanceof Error ? error.message : String(error) }] };
            }
        },
    },
};
/** Project resolved configuration back into the optional-field `Config` contract. */
function normalized(resolved) {
    return {
        enabled: resolved.enabled,
        projectCommandDirs: [...resolved.projectDirs],
        userCommandDirs: [...resolved.userDirs],
        includeClaudeDirs: resolved.projectDirs.includes(CLAUDE_PROJECT_DIR),
        maxDepth: resolved.maxDepth,
        maxFileBytes: resolved.maxFileBytes,
    };
}
/**
 * Resolve and validate the feature configuration.
 * @param config - raw feature configuration.
 * @returns a detached, deeply immutable configuration.
 * @throws when a directory entry is empty, absolute where relative is required,
 *   or a budget is not a positive integer.
 */
export function resolveConfig(config = {}) {
    const projectDirs = config.projectCommandDirs === undefined
        ? [...DEFAULT_PROJECT_DIRS]
        : [...config.projectCommandDirs];
    if (config.includeClaudeDirs === true)
        projectDirs.push(CLAUDE_PROJECT_DIR);
    for (const dir of projectDirs)
        validateRelativeDir('projectCommandDirs', dir);
    const userDirs = config.userCommandDirs === undefined
        ? defaultUserDirs()
        : config.userCommandDirs.map(expandHome);
    if (config.includeClaudeDirs === true)
        userDirs.push(join(homedir(), '.claude', 'commands'));
    for (const dir of userDirs) {
        if (dir.trim().length === 0)
            throw new Error('ptc-commands: userCommandDirs entries must be non-empty');
    }
    const maxDepth = config.maxDepth ?? 2;
    if (!Number.isInteger(maxDepth) || maxDepth < 0) {
        throw new Error(`ptc-commands: maxDepth (${maxDepth}) must be an integer greater than or equal to 0`);
    }
    const maxFileBytes = config.maxFileBytes ?? 65_536;
    if (!Number.isInteger(maxFileBytes) || maxFileBytes <= 0) {
        throw new Error(`ptc-commands: maxFileBytes (${maxFileBytes}) must be a positive integer`);
    }
    return Object.freeze({
        enabled: config.enabled ?? true,
        projectDirs: Object.freeze(projectDirs),
        userDirs: Object.freeze(userDirs.map(dir => resolve(dir))),
        maxDepth,
        maxFileBytes,
    });
}
/** Default user-global command roots: the shared agents home, then the dsh home. */
function defaultUserDirs() {
    return [
        join(resolveAgentsHome(), ...DEFAULT_USER_DIR_NAMES),
        join(resolveDshHome(), ...DEFAULT_USER_DIR_NAMES),
    ];
}
/** Expand a leading `~` against the OS home directory. */
function expandHome(dir) {
    return dir === '~' || dir.startsWith('~/') || dir.startsWith('~\\')
        ? join(homedir(), dir.slice(1))
        : dir;
}
/** Project directories must stay relative path segments below the project root. */
function validateRelativeDir(field, dir) {
    if (dir.trim().length === 0)
        throw new Error(`ptc-commands: ${field} entries must be non-empty`);
    if (isAbsolute(dir))
        throw new Error(`ptc-commands: ${field} entries must be relative (${dir} is absolute)`);
    if (dir.split(/[\\/]/).includes('..'))
        throw new Error(`ptc-commands: ${field} entries must not traverse upward (${dir})`);
}
//# sourceMappingURL=config.js.map