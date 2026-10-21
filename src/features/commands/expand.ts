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

/** Match `$ARGUMENTS`, `$ARGUMENTS[N]`, or `$N` at `start`, returning its length. */
function placeholderLength(template: string, start: number): number {
  if (template[start] !== '$') return 0
  if (template.startsWith('ARGUMENTS', start + 1)) {
    const after = start + 1 + 'ARGUMENTS'.length
    const next = template[after]
    // `$ARGUMENTS` must end at a token boundary; `$ARGUMENTSX` is not one.
    if (next !== undefined && /[A-Za-z0-9]/.test(next)) return 0
    if (next === '[') {
      const close = template.indexOf(']', after + 1)
      if (close > after + 1 && /^[0-9]+$/.test(template.slice(after + 1, close))) return close + 1 - start
    }
    return after - start
  }
  let end = start + 1
  while (true) {
    const digit = template[end]
    if (digit === undefined || digit < '0' || digit > '9') break
    end += 1
  }
  return end > start + 1 ? end - start : 0
}

/**
 * Split a typed argument string into shell-style tokens: runs of whitespace
 * separate tokens, single- and double-quoted spans keep their content (quotes
 * removed, no escape processing), and an unterminated quote takes the rest of
 * the input as one token.
 * @param rawInput - the exact text following the command name.
 * @returns positional tokens, in order.
 */
export function tokenizeArguments(rawInput: string): string[] {
  const text = rawInput.trim()
  const tokens: string[] = []
  let index = 0
  while (index < text.length) {
    while (index < text.length && /\s/.test(text[index] ?? '')) index += 1
    if (index >= text.length) break
    const quote = text[index]
    if (quote === '\'' || quote === '"') {
      const close = text.indexOf(quote, index + 1)
      if (close < 0) {
        tokens.push(text.slice(index + 1))
        break
      }
      tokens.push(text.slice(index + 1, close))
      index = close + 1
      continue
    }
    let end = index
    while (end < text.length && !/\s/.test(text[end] ?? '')) end += 1
    tokens.push(text.slice(index, end))
    index = end
  }
  return tokens
}

/**
 * Expand one command template against the typed arguments.
 * @param template - the command file body with frontmatter removed.
 * @param rawInput - the exact text following the command name.
 * @returns the expanded prompt text.
 */
export function expandCommandTemplate(template: string, rawInput: string): string {
  const trimmedInput = rawInput.trim()
  const tokens = tokenizeArguments(rawInput)
  let expanded = ''
  let sawPlaceholder = false
  let index = 0
  while (index < template.length) {
    const dollar = template.indexOf('$', index)
    if (dollar < 0) {
      expanded += template.slice(index)
      break
    }
    const length = placeholderLength(template, dollar)
    if (length === 0) {
      expanded += template.slice(index, dollar + 1)
      index = dollar + 1
      continue
    }
    const token = template.slice(dollar, dollar + length)
    // A run of backslashes directly before the placeholder: an odd run spends
    // exactly one backslash on escaping; the rest survive verbatim.
    let backslashes = 0
    let cursor = dollar - 1
    while (cursor >= 0 && template[cursor] === '\\') {
      backslashes += 1
      cursor -= 1
    }
    expanded += template.slice(index, dollar - (backslashes % 2 === 1 ? 1 : 0))
    if (backslashes % 2 === 1) {
      expanded += token
    } else {
      sawPlaceholder = true
      const indexed = /^\$(?:ARGUMENTS\[([0-9]+)\]|([0-9]+))$/.exec(token)
      if (indexed === null) {
        expanded += trimmedInput
      } else {
        const position = Number(indexed[1] ?? indexed[2])
        expanded += tokens[position] ?? token
      }
    }
    index = dollar + length
  }
  if (!sawPlaceholder && trimmedInput.length > 0) {
    expanded += `${expanded.length > 0 ? '\n\n' : ''}ARGUMENTS: ${trimmedInput}`
  }
  return expanded
}
