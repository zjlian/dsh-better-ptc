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
import { readdir, readFile, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';
/** Host-filesystem adapter: node fs reads with absent paths reading empty. */
export const nodeFileIo = {
    async readDir(path) {
        try {
            const entries = await readdir(path, { withFileTypes: true });
            const result = [];
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    result.push({ name: entry.name, isDirectory: true });
                    continue;
                }
                if (entry.isSymbolicLink()) {
                    try {
                        result.push({ name: entry.name, isDirectory: (await stat(join(path, entry.name))).isDirectory() });
                    }
                    catch {
                        result.push({ name: entry.name, isDirectory: false });
                    }
                    continue;
                }
                result.push({ name: entry.name, isDirectory: false });
            }
            return result;
        }
        catch {
            // An absent or unreadable root is an expected empty scan, not a failure.
            return [];
        }
    },
    async readText(path, maxBytes) {
        try {
            const content = await readFile(path, { encoding: 'utf8' });
            if (Buffer.byteLength(content, 'utf8') > maxBytes)
                return undefined;
            return content;
        }
        catch {
            return undefined;
        }
    },
};
/**
 * Walk one command root and parse every markdown file it holds.
 * @param root - the directory and precedence class to scan.
 * @param io - filesystem seam.
 * @param options - depth and size budgets.
 * @returns parsed commands in deterministic walk order, plus warnings.
 */
export async function discoverRoot(root, io, options) {
    const commands = [];
    const warnings = [];
    await walk(root, io, options, root.path, 0, commands, warnings);
    return { commands, warnings };
}
/** One directory level: sorted entries, subdirectories before flat files. */
async function walk(root, io, options, directory, depth, commands, warnings) {
    const entries = [...await io.readDir(directory)].sort((left, right) => left.name.localeCompare(right.name));
    for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory) {
            if (depth < options.maxDepth)
                await walk(root, io, options, path, depth + 1, commands, warnings);
            continue;
        }
        if (!entry.name.toLowerCase().endsWith('.md'))
            continue;
        await readCommandFile(root, io, options, directory, path, entry.name, commands, warnings);
    }
}
/** Parse one candidate file into a CommandFile, or warn and skip it. */
async function readCommandFile(root, io, options, directory, path, fileName, commands, warnings) {
    const text = await io.readText(path, options.maxFileBytes);
    if (text === undefined) {
        warnings.push(`command file missing, unreadable, or over ${options.maxFileBytes} bytes: ${path}`);
        return;
    }
    const parsed = parseCommandText(text);
    if (parsed === undefined || parsed.template.length === 0) {
        warnings.push(`command file has no body after frontmatter: ${path}`);
        return;
    }
    const name = commandName(root.path, directory, fileName);
    if (name === undefined) {
        warnings.push(`command file name has no usable characters: ${path}`);
        return;
    }
    for (const key of parsed.ignoredFrontmatter) {
        warnings.push(`command "${name}" ignores unsupported frontmatter key "${key}" (${path})`);
    }
    commands.push({
        name,
        description: parsed.description ?? `Custom command from ${path}`,
        argumentHint: parsed.argumentHint,
        template: parsed.template,
        path,
        scope: root.scope,
        ignoredFrontmatter: parsed.ignoredFrontmatter,
    });
}
/**
 * Kebab-case a path below the root into the command-name grammar, or `undefined`.
 * The grammar mirrors the command registry's own rule (a leading lowercase
 * letter, then lowercase letters, digits, `_`, `-`), so a name the registry
 * would reject is skipped at discovery instead of thrown at registration.
 */
function commandName(rootPath, directory, fileName) {
    const relative = directory === rootPath ? fileName : `${directory.slice(rootPath.length + 1)}${sep}${fileName}`;
    const segments = relative.split(/[\\/]/);
    segments[segments.length - 1] = segments[segments.length - 1].replace(/\.md$/i, '');
    const name = segments.map(kebab).filter(segment => segment.length > 0).join('-');
    return /^[a-z][a-z0-9_-]*$/.test(name) ? name : undefined;
}
/** Lowercase and collapse every character the command grammar rejects. */
function kebab(segment) {
    return segment.toLowerCase().replaceAll(/[^a-z0-9_-]+/g, '-').replaceAll(/^-+|-+$/g, '');
}
/** Frontmatter keys this bundle acts on. */
const USED_KEYS = new Set(['description', 'argument-hint']);
/**
 * Parse one command file's text: optional `---` frontmatter with flat
 * `key: value` lines, then the template body.
 * @param text - the complete file content.
 * @returns the parsed fields, or `undefined` when no body follows.
 */
export function parseCommandText(text) {
    const lines = text.split('\n');
    let start = 0;
    const fields = new Map();
    if (lines[0]?.replace(/\r$/, '') === '---') {
        let close = 1;
        while (close < lines.length && lines[close]?.replace(/\r$/, '') !== '---')
            close += 1;
        if (close < lines.length) {
            for (let index = 1; index < close; index += 1) {
                const match = /^([A-Za-z][A-Za-z0-9_-]*)\s*:\s*(.*)$/.exec((lines[index] ?? '').replace(/\r$/, ''));
                if (match !== null)
                    fields.set(match[1], unquote(match[2] ?? ''));
            }
            start = close + 1;
        }
    }
    const template = lines.slice(start).join('\n').trim();
    return {
        description: nonEmpty(fields.get('description')),
        argumentHint: nonEmpty(fields.get('argument-hint')),
        template,
        ignoredFrontmatter: [...fields.keys()].filter(key => !USED_KEYS.has(key)),
    };
}
/** Strip one balanced pair of matching quotes around a scalar value. */
function unquote(value) {
    const trimmed = value.trim();
    if (trimmed.length >= 2 && ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"')))) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}
function nonEmpty(value) {
    const trimmed = value?.trim();
    return trimmed === undefined || trimmed.length === 0 ? undefined : trimmed;
}
//# sourceMappingURL=discover.js.map