/**
 * PTC-preset host entry (package `./preset` export, one row appended to the
 * shipped `ptc` agent preset by this bundle's patch): mounts the features that
 * belong to the preset's standing composition. Registrations made by these
 * features land in the preset's scope layer, so they are visible exactly to
 * agents of that preset — the structural "PTC mode only" isolation.
 *
 * @module dsh-better-ptc/entries/preset
 */
export declare const name: string, inject: readonly string[], Config: import("../support/entry.ts").StandardSchema<Record<string, unknown>>, apply: (ctx: import("@deepseek-ai/cordis").Context, config?: Record<string, unknown>) => void;
//# sourceMappingURL=preset.d.ts.map