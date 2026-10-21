/**
 * Pure `$ARGUMENTS` template expansion for command files, aligned with Claude
 * Code's substitution rules: `$ARGUMENTS` expands to the full argument string
 * as typed, `$ARGUMENTS[N]` and its `$N` shorthand expand to shell-quoted
 * positional tokens (0-based), an indexed placeholder with no argument at its
 * position stays as literal text, a `\` immediately before a placeholder
 * escapes it (a doubled backslash keeps both characters and still expands),
 * and a template whose body holds no placeholder at all gets the typed
 * arguments appended as `ARGUMENTS: <input>` so the model still sees them.
 * Inserted values never re-expand.
 *
 * @module dsh-better-ptc/features/commands/expand
 */
/**
 * Split a typed argument string into shell-style tokens: runs of whitespace
 * separate tokens, single- and double-quoted spans keep their content (quotes
 * removed, no escape processing), and an unterminated quote takes the rest of
 * the input as one token.
 * @param rawInput - the exact text following the command name.
 * @returns positional tokens, in order.
 */
export declare function tokenizeArguments(rawInput: string): string[];
/**
 * Expand one command template against the typed arguments.
 * @param template - the command file body with frontmatter removed.
 * @param rawInput - the exact text following the command name.
 * @returns the expanded prompt text.
 */
export declare function expandCommandTemplate(template: string, rawInput: string): string;
//# sourceMappingURL=expand.d.ts.map