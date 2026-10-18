/**
 * Deployment policy for the PTC program-repair experiment. The plugin declares
 * its own standard-schema config so a profile can install it without a
 * schemastery dependency; validation stays fail-loud at load.
 * @module @deepseek-ai/dsh-ptc-repair/config
 */
/** Compile the standard-schema projection Cordis resolves before `apply` runs. */
export const Config = {
    '~standard': {
        version: 1,
        vendor: 'ptc-repair',
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
        timeoutMs: resolved.timeoutMs,
        maxOutputTokens: resolved.maxOutputTokens,
        maxCodeGrowth: resolved.maxCodeGrowth,
        ...resolved.provider === undefined ? {} : { provider: resolved.provider },
        ...resolved.model === undefined ? {} : { model: resolved.model },
    };
}
/**
 * Resolve and validate the plugin configuration.
 * @param config - raw plugin configuration.
 * @returns a detached, deeply immutable configuration.
 * @throws when a budget is not a positive integer or only one route field is set.
 */
export function resolveConfig(config = {}) {
    const resolved = {
        timeoutMs: config.timeoutMs ?? 20_000,
        maxOutputTokens: config.maxOutputTokens ?? 4096,
        maxCodeGrowth: config.maxCodeGrowth ?? 2,
        provider: config.provider,
        model: config.model,
    };
    requirePositiveInteger('timeoutMs', resolved.timeoutMs);
    requirePositiveInteger('maxOutputTokens', resolved.maxOutputTokens);
    if (!Number.isFinite(resolved.maxCodeGrowth) || resolved.maxCodeGrowth <= 1) {
        throw new Error(`ptc-repair: maxCodeGrowth (${resolved.maxCodeGrowth}) must be a finite number greater than 1`);
    }
    if ((resolved.provider === undefined) !== (resolved.model === undefined)) {
        throw new Error('ptc-repair: provider and model must be supplied together');
    }
    if (resolved.provider !== undefined && resolved.provider.length === 0) {
        throw new Error('ptc-repair: provider must be a non-empty string');
    }
    if (resolved.model !== undefined && resolved.model.length === 0) {
        throw new Error('ptc-repair: model must be a non-empty string');
    }
    return Object.freeze(resolved);
}
/** Reject a budget value that is not a positive integer. */
function requirePositiveInteger(name, value) {
    if (!Number.isInteger(value) || value <= 0) {
        throw new Error(`ptc-repair: ${name} (${value}) must be a positive integer`);
    }
}
//# sourceMappingURL=config.js.map