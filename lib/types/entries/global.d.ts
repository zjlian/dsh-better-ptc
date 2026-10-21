/**
 * Global host entry (package `.` export, loader row `better-ptc`): mounts the
 * features that belong to the host-global scope. Adding a global feature means
 * adding it to this table — the loader row and `cordis.patch.yml` never change.
 *
 * @module dsh-better-ptc/entries/global
 */
export declare const name: string, inject: readonly string[], Config: import("../support/entry.ts").StandardSchema<Record<string, unknown>>, apply: (ctx: import("@deepseek-ai/cordis").Context, config?: Record<string, unknown>) => void;
//# sourceMappingURL=global.d.ts.map