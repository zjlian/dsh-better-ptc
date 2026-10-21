/**
 * Host-entry composition: aggregates a fixed table of features into one Cordis
 * plugin entry (`name` / `inject` / `Config` / `apply`) so the loader rows in
 * `cordis.patch.yml` stay fixed while features grow inside the package. Each
 * feature keeps the ordinary function-plugin contract; the entry unions the
 * injections, validates every feature's config subtree through the feature's
 * own standard schema, and mounts features with per-feature failure
 * containment.
 *
 * @module dsh-better-ptc/support/entry
 */
/**
 * Compose one Cordis plugin entry over a fixed feature table.
 * @param name - entry name used by loader diagnostics.
 * @param features - feature table; the keys are the entry config's fields.
 * @returns the plugin entry a loader row or package export consumes.
 */
export function composeEntry(name, features) {
    return {
        name,
        inject: [...new Set(Object.values(features).flatMap(feature => feature.inject ?? []))],
        Config: entrySchema(name, features),
        apply(ctx, config = {}) {
            for (const [key, feature] of Object.entries(features)) {
                try {
                    feature.apply(ctx, config[key] ?? {});
                }
                catch (error) {
                    ctx.logger.warn(`${name}: feature ${feature.name} (${key}) failed to mount: ${errorMessage(error)}`);
                }
            }
        },
    };
}
/** Aggregate per-feature schemas into one entry schema with per-field issues. */
function entrySchema(name, features) {
    return {
        '~standard': {
            version: 1,
            vendor: name,
            validate(value) {
                // A loader row without `config` resolves the schema with `undefined`;
                // absent config means every feature runs on its own defaults.
                if (value !== undefined && value !== null && (typeof value !== 'object' || Array.isArray(value))) {
                    return { issues: [{ message: `${name}: config must be an object keyed by feature name` }] };
                }
                const raw = (value ?? {});
                const issues = [];
                for (const key of Object.keys(raw)) {
                    if (!(key in features)) {
                        issues.push({ message: `${name}: unknown feature key "${key}" (known: ${Object.keys(features).join(', ')})` });
                    }
                }
                const normalized = {};
                for (const [key, feature] of Object.entries(features)) {
                    const subtree = raw[key] ?? {};
                    if (typeof subtree !== 'object' || subtree === null || Array.isArray(subtree)) {
                        issues.push({ message: `${name}: config.${key} must be an object` });
                        continue;
                    }
                    const schema = feature.Config;
                    if (schema === undefined) {
                        normalized[key] = subtree;
                        continue;
                    }
                    const result = schema['~standard'].validate(subtree);
                    if ('issues' in result) {
                        for (const issue of result.issues)
                            issues.push({ message: `${name}: config.${key}: ${issue.message}` });
                        continue;
                    }
                    normalized[key] = result.value;
                }
                return issues.length > 0 ? { issues } : { value: normalized };
            },
        },
    };
}
function errorMessage(error) {
    return error instanceof Error ? error.message : String(error);
}
//# sourceMappingURL=entry.js.map