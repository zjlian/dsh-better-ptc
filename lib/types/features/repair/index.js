/**
 * PTC repair experiment: a focused auxiliary model call repairs a `run_code`
 * program that the Node PTC runtime rejected before execution, and a second one
 * supplies the required `description` argument when the registry rejected the
 * call's arguments before the program could run. A registered message
 * projection replaces the rejected call's arguments in the model-visible
 * assistant message, and the repaired call is re-run inside the same tool call.
 * When anything in the repair path fails, the call keeps its baseline behavior
 * (the original arguments run and their failure reaches the model unchanged).
 *
 * The plugin needs no core change: `run_code` is a normal tool execution, the
 * repair record is an ignorable `plugin:` record, and the rewrite is a
 * fiber-owned message projection.
 * @module dsh-better-ptc/features/repair
 */
var __addDisposableResource = (this && this.__addDisposableResource) || function (env, value, async) {
    if (value !== null && value !== void 0) {
        if (typeof value !== "object" && typeof value !== "function") throw new TypeError("Object expected.");
        var dispose, inner;
        if (async) {
            if (!Symbol.asyncDispose) throw new TypeError("Symbol.asyncDispose is not defined.");
            dispose = value[Symbol.asyncDispose];
        }
        if (dispose === void 0) {
            if (!Symbol.dispose) throw new TypeError("Symbol.dispose is not defined.");
            dispose = value[Symbol.dispose];
            if (async) inner = dispose;
        }
        if (typeof dispose !== "function") throw new TypeError("Object not disposable.");
        if (inner) dispose = function() { try { inner.call(this); } catch (e) { return Promise.reject(e); } };
        env.stack.push({ value: value, dispose: dispose, async: async });
    }
    else if (async) {
        env.stack.push({ async: true });
    }
    return value;
};
var __disposeResources = (this && this.__disposeResources) || (function (SuppressedError) {
    return function (env) {
        function fail(e) {
            env.error = env.hasError ? new SuppressedError(e, env.error, "An error was suppressed during disposal.") : e;
            env.hasError = true;
        }
        var r, s = 0;
        function next() {
            while (r = env.stack.pop()) {
                try {
                    if (!r.async && s === 1) return s = 0, env.stack.push(r), Promise.resolve().then(next);
                    if (r.dispose) {
                        var result = r.dispose.call(r.value);
                        if (r.async) return s |= 2, Promise.resolve(result).then(next, function(e) { fail(e); return next(); });
                    }
                    else s |= 1;
                }
                catch (e) {
                    fail(e);
                }
            }
            if (s === 1) return env.hasError ? Promise.reject(env.error) : Promise.resolve();
            if (env.hasError) throw env.error;
        }
        return next();
    };
})(typeof SuppressedError === "function" ? SuppressedError : function (error, suppressed, message) {
    var e = new Error(message);
    return e.name = "SuppressedError", e.error = error, e.suppressed = suppressed, e;
});
import { BlockAssembler } from '@deepseek-ai/dsh-llm';
import { deadline } from '@deepseek-ai/dsh-timeout';
import { RUN_CODE_NAME } from '@deepseek-ai/dsh-tools';
import { preflightArguments, violationsOf } from "./arguments.js";
import { Config, resolveConfig } from "./config.js";
import { findCallingAssistant } from "./history.js";
import { preflightProgram } from "./preflight.js";
import { appendRepairAccepted, appendRepairFailed, appendRepairRequest } from "./records.js";
import { repairProjection } from "./projection.js";
import { buildDescribeMessage, buildRepairMessage, DESCRIBE_SYSTEM_PROMPT, extractDescription, extractProgram, judgeCandidate, judgeDescription, REPAIR_SYSTEM_PROMPT, } from "./prompt.js";
export { Config };
/** Cordis plugin name used by loader diagnostics. */
export const name = 'ptc-repair';
/** The services the repair path uses: the auxiliary model, session store, and tool registry. */
export const inject = ['llm', 'sessions', 'tools'];
/** The deadline classification code this plugin owns for its auxiliary calls. */
const REPAIR_TIMEOUT_CODE = 'PTC_REPAIR_TIMEOUT';
/**
 * Register the repair listener and its message projection.
 * @param ctx - plugin context owning the listener and projection.
 * @param raw - loader-validated plugin configuration.
 */
export function apply(ctx, raw = {}) {
    const config = resolveConfig(raw);
    ctx.sessions.registerMessageProjection(repairProjection);
    // A call is repaired at most once: the re-dispatched call re-enters this same
    // waterfall, and a second repair of the same identity must fall through.
    const repairing = new Set();
    ctx.on('tools/execute', async (exec, next) => {
        const args = eligibleCall(ctx, exec, repairing);
        if (args === undefined)
            return next();
        const programFailure = preflightProgram(args.code);
        const argumentFailure = argumentFailureOf(ctx, exec);
        if (programFailure === undefined && argumentFailure === undefined)
            return next();
        const session = exec.agent?.session;
        if (session === undefined)
            return next();
        const route = resolveRoute(config, session);
        if (route === undefined)
            return next();
        const key = callKey(session, exec);
        repairing.add(key);
        try {
            const plan = await planRepair(ctx, config, exec, session, route, args, programFailure, argumentFailure);
            if (plan === undefined)
                return await next();
            if (!commitRepair(ctx, session, exec, route, args, plan))
                return await next();
            return await redispatch(ctx, exec, repairedArguments(args, plan));
        }
        catch (error) {
            // Any repair-side failure (record rejection, auxiliary call misuse,
            // cancellation) preserves baseline behavior: the original arguments run.
            warn(ctx, `repair skipped for ${String(exec.callId)}: ${bounded(errorMessage(error))}`);
            return await next();
        }
        finally {
            repairing.delete(key);
        }
    });
}
/**
 * Decide whether this dispatch is the model-direct, still-unrepaired `run_code`
 * call the plugin repairs, and return its arguments when it is.
 * @param ctx - plugin context for the optional PTC runtime lookup.
 * @param exec - the pending execution.
 * @param repairing - call identities whose repair is in flight.
 * @returns the validated run_code arguments, or `undefined` to delegate unchanged.
 */
function eligibleCall(ctx, exec, repairing) {
    if (exec.name !== RUN_CODE_NAME)
        return undefined;
    // Only the model-visible transport call is repairable; an SDK sub-dispatch is
    // an ordinary native tool call and never carries a program.
    if (exec.parent !== undefined)
        return undefined;
    if (exec.agent === undefined)
        return undefined;
    if (!isTypeScriptProgramRuntime(ctx))
        return undefined;
    const args = exec.arguments;
    if (typeof args !== 'object' || args === null || Array.isArray(args))
        return undefined;
    const code = args['code'];
    if (typeof code !== 'string')
        return undefined;
    if (repairing.has(callKey(exec.agent.session, exec)))
        return undefined;
    return args;
}
/**
 * Preflight the call's own arguments against the schema the registry will
 * validate them with.
 * @param ctx - plugin context exposing the tool registry.
 * @param exec - the pending execution whose arguments are inspected.
 * @returns a repairable argument failure, or `undefined` to keep baseline.
 */
function argumentFailureOf(ctx, exec) {
    const tool = ctx.tools.get(RUN_CODE_NAME, exec.agent);
    if (tool === undefined)
        return undefined;
    try {
        return preflightArguments(tool.parameters, exec.arguments);
    }
    catch {
        // The language-aware parameter getter can reject a misconfigured runtime;
        // that failure is not an argument the repair may rewrite.
        return undefined;
    }
}
/**
 * The repair claims a call only under the runtime contract its preflight
 * mirrors: the Node PTC runtime type-strips a TypeScript program as the body
 * of an async function. Other languages keep the baseline path, and so does
 * any other program format a runtime reports (DSH ≥ 0.2.1-rc.3 exposes
 * `programFormat`; the persistent-in-memory Node runtime strips REPL
 * statements without the wrapper, where a repaired program could not be
 * re-judged). An absent `programFormat` is the base class's `function-body`
 * default.
 */
function isTypeScriptProgramRuntime(ctx) {
    const runtime = ctx.get('ptcRuntime');
    if (runtime?.language !== 'typescript')
        return false;
    return runtime.programFormat === undefined || runtime.programFormat === 'function-body';
}
/** Stable identity of one repair attempt: one session, one model call. */
function callKey(session, exec) {
    return `${session.id}\u0000${String(exec.callId)}`;
}
/**
 * Resolve the auxiliary route: an explicit configured pair wins; otherwise the
 * session's own logged request route is used, so the repair speaks the same
 * provider/model dialect as the program's author.
 * @param config - resolved plugin configuration.
 * @param session - the session owning the call.
 * @returns the route, or `undefined` when the session has no logged route.
 */
function resolveRoute(config, session) {
    if (config.provider !== undefined && config.model !== undefined) {
        return { provider: config.provider, model: config.model };
    }
    const header = session.requestHeader();
    const provider = header?.config.provider;
    const model = header?.config.model;
    if (typeof provider !== 'string' || provider.length === 0)
        return undefined;
    if (typeof model !== 'string' || model.length === 0)
        return undefined;
    return { provider, model };
}
/**
 * Ask the auxiliary model for every replacement this call needs, in the order
 * that lets a later answer describe the final program. Any rejected answer
 * leaves the whole call at baseline; the rejected attempt is recorded as an
 * ignorable failed-attempt record before this returns `undefined`.
 * @param ctx - plugin context exposing the LLM service.
 * @param config - resolved plugin configuration.
 * @param exec - the pending run_code execution (cancellation source).
 * @param session - the session owning the call.
 * @param route - the auxiliary provider/model route.
 * @param args - the original validated run_code arguments.
 * @param programFailure - the host compile diagnostic, when the program was rejected.
 * @param argumentFailure - the repairable argument failure, when arguments were rejected.
 * @returns the accepted repair, or `undefined` when no replacement was accepted.
 */
async function planRepair(ctx, config, exec, session, route, args, programFailure, argumentFailure) {
    let program = args.code;
    let usage;
    if (programFailure !== undefined) {
        const repaired = await repairProgram(ctx, config, exec, session, route, program, programFailure);
        if (repaired === undefined)
            return undefined;
        program = repaired.program;
        usage = repaired.usage;
    }
    let description;
    if (argumentFailure !== undefined) {
        const repaired = await describeProgram(ctx, config, exec, session, route, program);
        if (repaired === undefined)
            return undefined;
        description = repaired.description;
        usage = mergeUsage(usage, repaired.usage);
        const violations = violationsOf(argumentFailure.schema, repairedArguments(args, { program, description }));
        if (violations.length > 0) {
            logFailedAttempt(ctx, session, exec, route, args.code, `repaired arguments still invalid: ${bounded(violations.join('; '), 300)}`);
            return undefined;
        }
    }
    return {
        program,
        ...description === undefined ? {} : { description },
        ...usage === undefined ? {} : { usage },
    };
}
/**
 * Ask the auxiliary model to repair the program and judge its answer.
 * @param ctx - plugin context exposing the LLM service.
 * @param config - resolved plugin configuration.
 * @param exec - the pending run_code execution (cancellation source).
 * @param session - the session owning the call.
 * @param route - the auxiliary provider/model route.
 * @param program - the rejected program body.
 * @param failure - the host compile diagnostic for that program.
 * @returns the accepted program, or `undefined` when no replacement was accepted.
 */
async function repairProgram(ctx, config, exec, session, route, program, failure) {
    const outcome = await askAuxiliary(ctx, config, exec, session, route, REPAIR_SYSTEM_PROMPT, buildRepairMessage(program, failure));
    if (outcome.kind === 'rejected') {
        logFailedAttempt(ctx, session, exec, route, program, outcome.reason);
        return undefined;
    }
    const verdict = judgeCandidate(program, extractProgram(outcome.text), config.maxCodeGrowth);
    if (!verdict.ok) {
        logFailedAttempt(ctx, session, exec, route, program, `repair answer rejected: ${verdict.reason}`);
        return undefined;
    }
    return {
        program: verdict.program,
        ...outcome.usage === undefined ? {} : { usage: outcome.usage },
    };
}
/**
 * Ask the auxiliary model to write the missing `description` argument and judge
 * its answer.
 * @param ctx - plugin context exposing the LLM service.
 * @param config - resolved plugin configuration.
 * @param exec - the pending run_code execution (cancellation source).
 * @param session - the session owning the call.
 * @param route - the auxiliary provider/model route.
 * @param program - the program whose description is missing.
 * @returns the accepted description, or `undefined` when no answer was accepted.
 */
async function describeProgram(ctx, config, exec, session, route, program) {
    const outcome = await askAuxiliary(ctx, config, exec, session, route, DESCRIBE_SYSTEM_PROMPT, buildDescribeMessage(program));
    if (outcome.kind === 'rejected') {
        logFailedAttempt(ctx, session, exec, route, program, outcome.reason);
        return undefined;
    }
    const verdict = judgeDescription(extractDescription(outcome.text));
    if (!verdict.ok) {
        logFailedAttempt(ctx, session, exec, route, program, `description answer rejected: ${verdict.reason}`);
        return undefined;
    }
    return {
        description: verdict.description,
        ...outcome.usage === undefined ? {} : { usage: outcome.usage },
    };
}
/**
 * Dispatch one auxiliary model call through the session's own route, logging
 * its complete request before dispatch. Every failure to receive an answer is
 * reported as a rejection reason, never thrown.
 * @param ctx - plugin context exposing the LLM service.
 * @param config - resolved plugin configuration.
 * @param exec - the pending run_code execution (cancellation source).
 * @param session - the session owning the call.
 * @param route - the auxiliary provider/model route.
 * @param system - the prompt's whole system instruction.
 * @param message - the prompt's single user message.
 * @returns the answer text with its usage, or the rejection reason.
 */
async function askAuxiliary(ctx, config, exec, session, route, system, message) {
    const env_1 = { stack: [], error: void 0, hasError: false };
    try {
        const callDeadline = __addDisposableResource(env_1, deadline(exec.signal, config.timeoutMs, REPAIR_TIMEOUT_CODE), false);
        const options = Object.freeze({
            provider: route.provider,
            model: route.model,
            messages: [message],
            system,
            maxTokens: config.maxOutputTokens,
            sessionId: session.id,
            signal: callDeadline.signal,
        });
        appendRepairRequest(session, {
            callId: exec.callId,
            route,
            system,
            messages: [message],
            maxTokens: config.maxOutputTokens,
        });
        try {
            const assembler = new BlockAssembler();
            for await (const chunk of ctx.llm.stream(options)) {
                callDeadline.signal.throwIfAborted();
                assembler.push(chunk);
            }
            callDeadline.signal.throwIfAborted();
            if (assembler.finish.kind !== 'stop') {
                return { kind: 'rejected', reason: `repair model finished with "${assembler.finish.kind}"` };
            }
            const text = assembler.blocks()
                .flatMap(block => block.type === 'text' ? [block.text] : [])
                .join('\n');
            return {
                kind: 'answer',
                text,
                ...assembler.usage === undefined ? {} : { usage: assembler.usage },
            };
        }
        catch (error) {
            return { kind: 'rejected', reason: `repair call failed: ${bounded(errorMessage(error))}` };
        }
    }
    catch (e_1) {
        env_1.error = e_1;
        env_1.hasError = true;
    }
    finally {
        __disposeResources(env_1);
    }
}
/** The complete argument object one repair accepted. */
function repairedArguments(args, plan) {
    const next = { ...args, code: plan.program };
    if (plan.description !== undefined)
        next['description'] = plan.description;
    return next;
}
/**
 * Merge the usage of two auxiliary calls into the one accounting value a repair
 * record keeps.
 * @param first - usage of the program repair call, when that call ran.
 * @param second - usage of the description call, when that call ran.
 * @returns their sum, or whichever single usage exists.
 */
function mergeUsage(first, second) {
    if (first === undefined)
        return second;
    if (second === undefined)
        return first;
    const sum = (a, b) => a === undefined && b === undefined ? undefined : (a ?? 0) + (b ?? 0);
    const totalTokens = sum(first.totalTokens, second.totalTokens);
    const cacheReadTokens = sum(first.cacheReadTokens, second.cacheReadTokens);
    const cacheWriteTokens = sum(first.cacheWriteTokens, second.cacheWriteTokens);
    const reasoningTokens = sum(first.reasoningTokens, second.reasoningTokens);
    return {
        inputTokens: first.inputTokens + second.inputTokens,
        outputTokens: first.outputTokens + second.outputTokens,
        ...totalTokens === undefined ? {} : { totalTokens },
        ...cacheReadTokens === undefined ? {} : { cacheReadTokens },
        ...cacheWriteTokens === undefined ? {} : { cacheWriteTokens },
        ...reasoningTokens === undefined ? {} : { reasoningTokens },
    };
}
/**
 * Commit an accepted repair: the target assistant message must still be a
 * current surface node, and the repair record is appended before the tool
 * result so the projection rewrites the message the next request derives.
 * A record rejection returns `false` and the caller falls back to baseline.
 * @param ctx - plugin context for the surface diagnostic.
 * @param session - the session owning the call.
 * @param exec - the pending run_code execution.
 * @param route - the auxiliary provider/model route.
 * @param args - the original validated run_code arguments.
 * @param plan - the accepted repair.
 * @returns whether the repair record was appended.
 */
function commitRepair(ctx, session, exec, route, args, plan) {
    const assistant = findCallingAssistant(session, exec.callId);
    if (assistant === undefined) {
        warn(ctx, `repair skipped for ${String(exec.callId)}: requesting assistant message not on the surface`);
        return false;
    }
    appendRepairAccepted(session, {
        callId: exec.callId,
        targetSeq: assistant.seq,
        route,
        ...plan.program === args.code ? {} : { originalCode: args.code, repairedCode: plan.program },
        ...plan.description === undefined ? {} : { repairedDescription: plan.description },
        argumentsJson: JSON.stringify(repairedArguments(args, plan)),
        attempt: 1,
        ...plan.usage === undefined ? {} : { usage: plan.usage },
    });
    return true;
}
/**
 * Re-run the repaired call through the same registry pipeline under the same
 * call identity, so the loop commits one result for the call the model made.
 * @param ctx - plugin context exposing the tool registry.
 * @param exec - the pending run_code execution.
 * @param args - the complete repaired argument object.
 * @returns the re-dispatched result, or a structured failure when dispatch rejects.
 */
async function redispatch(ctx, exec, args) {
    try {
        return await ctx.tools.execute({
            callId: exec.callId,
            rootCallId: exec.rootCallId,
            name: exec.name,
            arguments: args,
            ...exec.agent === undefined ? {} : { agent: exec.agent },
            signal: exec.signal,
        });
    }
    catch (error) {
        const message = errorMessage(error);
        return {
            content: [{ type: 'text', text: `Error: repaired program could not be dispatched: ${message}` }],
            isError: true,
            error: { message: `repaired program could not be dispatched: ${message}` },
        };
    }
}
/** Append the failed-attempt record, containing its own append failure. */
function logFailedAttempt(ctx, session, exec, route, program, reason) {
    try {
        appendRepairFailed(session, {
            callId: exec.callId,
            route,
            originalCode: program,
            reason: bounded(reason, 500),
            attempt: 1,
        });
    }
    catch (error) {
        warn(ctx, `repair failure record failed for ${String(exec.callId)}: ${bounded(errorMessage(error))}`);
    }
}
/** Report one contained repair diagnostic under this plugin's name. */
function warn(ctx, message) {
    ctx.logger.warn(`ptc-repair: ${message}`);
}
/** Best-effort human-readable message from an arbitrary thrown value. */
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
/** Bound a diagnostic before it reaches a log line or a durable record. */
function bounded(text, max = 240) {
    return text.length <= max ? text : `${text.slice(0, max)}…`;
}
/** The repair feature mounted by the global host entry. */
export const repair = {
    name,
    inject,
    Config,
    apply: (ctx, raw) => apply(ctx, raw),
};
//# sourceMappingURL=index.js.map