/**
 * Deployment policy for the PTC program-repair experiment. The plugin declares
 * its own standard-schema config so a profile can install it without a
 * schemastery dependency; validation stays fail-loud at load.
 * @module @deepseek-ai/dsh-ptc-repair/config
 */
/**
 * Plugin configuration. The repair route defaults to the session's own logged
 * `request/header` route; `provider`/`model` override it only as an explicit
 * pair. Budgets are positive integers; a candidate program may grow to at most
 * `maxCodeGrowth` times the rejected program's length.
 */
export interface Config {
    /** Deadline for the auxiliary repair call in milliseconds (default 20000). */
    timeoutMs?: number;
    /** Output token cap for the auxiliary repair call (default 4096). */
    maxOutputTokens?: number;
    /**
     * Maximum accepted length of a repaired program relative to the rejected
     * program (default 2).
     */
    maxCodeGrowth?: number;
    /** Provider of the auxiliary repair route; requires `model`. */
    provider?: string;
    /** Model of the auxiliary repair route; requires `provider`. */
    model?: string;
}
/** Validated configuration with every default resolved. */
export interface ResolvedConfig {
    readonly timeoutMs: number;
    readonly maxOutputTokens: number;
    readonly maxCodeGrowth: number;
    readonly provider: string | undefined;
    readonly model: string | undefined;
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
                message: string;
            }[];
        };
    };
}
/** Compile the standard-schema projection Cordis resolves before `apply` runs. */
export declare const Config: StandardSchema<Config>;
/**
 * Resolve and validate the plugin configuration.
 * @param config - raw plugin configuration.
 * @returns a detached, deeply immutable configuration.
 * @throws when a budget is not a positive integer or only one route field is set.
 */
export declare function resolveConfig(config?: Config): ResolvedConfig;
export {};
//# sourceMappingURL=config.d.ts.map