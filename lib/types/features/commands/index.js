/**
 * The `commands` feature: loads markdown command files from user-global roots
 * at mount and from project roots lazily as sessions appear, and registers
 * each effective command for exactly the agents whose preset id is listed in
 * the feature config (`presets`, default `ptc`). A command runs in the UI
 * command plane; its handler expands the file's template against the typed
 * arguments and submits the result as the agent's next user message, matching
 * the Claude Code / OpenCode `commands/` behavior. Precedence: project files
 * shadow user files of the same name, and these agent-layer registrations
 * shadow same-name global commands.
 *
 * The feature rides the bundle's single global host row and never touches any
 * shipped preset row: it reads each agent's live preset from the preset
 * registry and registers through that agent's own context, so the
 * registrations land in the agent's command layer — visible exactly to that
 * agent. This replaces the earlier verbatim override of the shipped `ptc`
 * preset row, which had to be re-copied onto every DSH upgrade.
 *
 * @module dsh-better-ptc/features/commands
 */
import { dirname, join } from 'node:path';
import { Config, resolveConfig } from "./config.js";
import { compile } from "./compile.js";
import { discoverRoot, nodeFileIo } from "./discover.js";
import { CommandRegistrations } from "./register.js";
/** Cordis plugin name used by loader diagnostics. */
export const name = 'ptc-commands';
/**
 * The services the feature requires: the command registry, per-agent working
 * directories, and the agent registry. The preset registry is read
 * optionally (`ctx.get`): a composition without presets has no session the
 * feature could serve, and requiring it would also block this row's other
 * features in such profiles.
 */
export const inject = ['commands', 'workingDirectory', 'agents'];
/**
 * Register the command-file discovery, the preset-gated per-agent command
 * mounts, and the lazy project-root discovery driven by qualifying sessions.
 * @param ctx - the mounting global entry context.
 * @param raw - loader-validated feature configuration.
 */
export function apply(ctx, raw = {}) {
    const config = resolveConfig(raw);
    if (!config.enabled)
        return;
    const roots = config.userDirs.map(path => ({ path, scope: 'user' }));
    const knownProjectRoots = new Set();
    const handledSessions = new Set();
    const mounted = new Map();
    let effective = new Map();
    let syncing;
    const rescan = async () => {
        const projectFiles = [];
        const userFiles = [];
        for (const root of roots) {
            const result = await discoverRoot(root, nodeFileIo, config);
            for (const warning of result.warnings)
                ctx.logger.warn(`ptc-commands: ${warning}`);
            const bucket = root.scope === 'project' ? projectFiles : userFiles;
            bucket.push(...result.commands);
        }
        const compiled = compile(projectFiles, userFiles);
        for (const shadow of compiled.shadows) {
            ctx.logger.warn(`ptc-commands: command "${shadow.name}" from ${shadow.loser.path} is shadowed by ${shadow.winner.path}`);
        }
        effective = compiled.effective;
        for (const entry of mounted.values())
            syncMounted(entry);
    };
    /** Bring one mounted session's registrations up to the current effective set. */
    const syncMounted = (entry) => {
        if (entry.registrations === undefined)
            return;
        const report = entry.registrations.sync(effective);
        if (report.added.length + report.replaced.length + report.removed.length > 0) {
            ctx.logger.info(`ptc-commands: ${report.added.length} added, ${report.replaced.length} replaced, ${report.removed.length} removed`
                + ` (${[...effective.keys()].join(', ')})`);
        }
    };
    const queueRescan = () => {
        syncing ??= rescan().catch((error) => {
            ctx.logger.warn(`ptc-commands: rescan failed: ${errorMessage(error)}`);
        }).finally(() => {
            syncing = undefined;
        });
    };
    /** Dispose one session's agent-layer registrations. */
    const unmount = (sessionId) => {
        const entry = mounted.get(sessionId);
        if (entry === undefined)
            return;
        mounted.delete(sessionId);
        entry.registrations = undefined;
        entry.stop();
    };
    /** Register the effective commands inside the agent's own context, so only that agent sees them. */
    const mountFor = (session, agent) => {
        const sessionId = session.id;
        if (mounted.has(sessionId))
            return;
        const entry = { sessionId, registrations: undefined, stop: () => { } };
        mounted.set(sessionId, entry);
        const fiber = agent.ctx.inject(['commands'], (child) => {
            const registrations = new CommandRegistrations(child, { io: nodeFileIo, maxFileBytes: config.maxFileBytes });
            entry.registrations = registrations;
            registrations.sync(effective);
            child.effect(() => () => registrations.dispose(), 'ptc-commands: agent registrations');
        });
        entry.stop = () => {
            entry.registrations = undefined;
            fiber.dispose().catch((error) => {
                ctx.logger.warn(`ptc-commands: unmount failed for ${sessionId}: ${errorMessage(error)}`);
            });
        };
    };
    /**
     * Align one session's mount with its agent's current preset. The preset is
     * read live from the registry, so a blank session switching presets is
     * re-evaluated on its `agent-preset/selected` event. Without a preset
     * registry no session can qualify.
     * @returns whether the session now holds a command mount.
     */
    const evaluate = (session) => {
        const registry = ctx.get('agentPresets');
        if (registry === undefined)
            return false;
        const agent = ctx.agents.get(session.id);
        if (agent === undefined) {
            // The agent is not published yet; a later hook re-evaluates this session.
            return false;
        }
        let preset;
        try {
            preset = registry.composedPreset(agent.ctx);
        }
        catch (error) {
            ctx.logger.warn(`ptc-commands: preset lookup failed for ${session.id}: ${errorMessage(error)}`);
            return false;
        }
        if (preset !== undefined && config.presets.includes(preset)) {
            mountFor(session, agent);
            return true;
        }
        unmount(session.id);
        return false;
    };
    /** Evaluate a session and, when it newly qualifies, discover its project root. */
    const consider = (session) => {
        if (!evaluate(session) || handledSessions.has(session.id))
            return;
        handledSessions.add(session.id);
        void discoverProjectRoot(ctx, session.id, knownProjectRoots).then((root) => {
            if (root === undefined)
                return;
            knownProjectRoots.add(root);
            for (const dir of config.projectDirs)
                roots.push({ path: join(root, dir), scope: 'project' });
            queueRescan();
        }).catch((error) => {
            ctx.logger.warn(`ptc-commands: project-root discovery failed for ${session.id}: ${errorMessage(error)}`);
        });
    };
    // User-global roots are cwd-independent: scan them once at mount.
    queueRescan();
    // Agents enter the registry before their session is announced, so a
    // created session already resolves its live preset here.
    ctx.on('session/created', consider);
    // A preset switch rebinds the agent before its event is appended, so the
    // re-evaluation reads the newly bound preset. The first event of every
    // other session re-evaluates as a catch-up path.
    ctx.on('session/event', (session, event) => {
        if (event.type === 'agent-preset/selected') {
            consider(session);
            return;
        }
        if (handledSessions.has(session.id))
            return;
        consider(session);
    });
    ctx.on('session/disposed', (session) => {
        handledSessions.delete(session.id);
        unmount(session.id);
    });
    // Sessions that predate this feature's activation still qualify.
    for (const session of ctx.sessions.list())
        consider(session);
    ctx.effect(() => () => {
        for (const sessionId of [...mounted.keys()])
            unmount(sessionId);
    }, 'ptc-commands: mount table');
}
/**
 * Resolve one qualifying session's project root from its working directory.
 * @param ctx - the mounting global entry context.
 * @param sessionId - the session whose project root is wanted.
 * @param knownProjectRoots - roots already folded into the scan.
 * @returns the project root to scan, or `undefined` when there is nothing new.
 */
async function discoverProjectRoot(ctx, sessionId, knownProjectRoots) {
    const agent = ctx.agents.get(sessionId);
    if (agent === undefined)
        return undefined;
    const cwd = await ctx.workingDirectory.ensure(agent);
    const root = await findProjectRoot(cwd);
    return knownProjectRoots.has(root) ? undefined : root;
}
/** Walk upward from `cwd` to the closest `.git` marker, falling back to `cwd`. */
async function findProjectRoot(cwd) {
    let current = cwd;
    while (true) {
        const entries = await nodeFileIo.readDir(current);
        if (entries.some(entry => entry.name === '.git'))
            return current;
        const parent = dirname(current);
        if (parent === current)
            return cwd;
        current = parent;
    }
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
/** The commands feature mounted by the global host entry. */
export const commands = {
    name,
    inject,
    Config,
    apply: (ctx, raw) => apply(ctx, raw),
};
//# sourceMappingURL=index.js.map
