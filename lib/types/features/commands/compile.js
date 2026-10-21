/**
 * Pure precedence merge for discovered command files. Project files shadow
 * user files of the same name outright; within one class the first file in
 * discovery order wins. Every shadowed file is reported so the feature can log
 * what the user is not getting.
 *
 * @module dsh-better-ptc/features/commands/compile
 */
/**
 * Merge discovered command files into one effective set.
 * @param project - project-root files in discovery order (higher precedence).
 * @param user - user-root files in discovery order (lower precedence).
 * @returns the effective map and the shadowing report.
 */
export function compile(project, user) {
    const effective = new Map();
    const shadows = [];
    for (const file of project)
        insert(effective, shadows, file);
    for (const file of user)
        insert(effective, shadows, file);
    return { effective, shadows };
}
function insert(effective, shadows, file) {
    const winner = effective.get(file.name);
    if (winner === undefined) {
        effective.set(file.name, file);
        return;
    }
    shadows.push({ name: file.name, winner, loser: file });
}
//# sourceMappingURL=compile.js.map