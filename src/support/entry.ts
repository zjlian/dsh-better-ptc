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

import type { Context } from '@deepseek-ai/cordis'

/**
 * Minimal standard-schema contract Cordis validates plugin config with. The
 * bundle declares its schemas directly so a profile can install it without a
 * schemastery dependency.
 */
export interface StandardSchema<T> {
  readonly '~standard': {
    readonly version: 1
    readonly vendor: string
    readonly validate: (value: unknown) => { readonly value: T } | { readonly issues: readonly { readonly message: string }[] }
  }
}

/** One self-contained feature mounted behind a host entry. */
export interface Feature {
  /** Fiber/diagnostic name of the feature. */
  readonly name: string
  /** Services the feature reads; the entry unions them into its own injection. */
  readonly inject?: readonly string[]
  /** Optional standard-schema validator for the feature's config subtree. */
  readonly Config?: StandardSchema<unknown>
  /** Register the feature on the mounting entry context. */
  readonly apply: (ctx: Context, config: unknown) => void
}

/** A fixed table of features behind one loader row, keyed by config field. */
export type FeatureTable = Readonly<Record<string, Feature>>

/** The Cordis plugin shape a loader row consumes. */
export interface PluginEntry {
  readonly name: string
  readonly inject: readonly string[]
  readonly Config: StandardSchema<Record<string, unknown>>
  readonly apply: (ctx: Context, config?: Record<string, unknown>) => void
}

/**
 * Compose one Cordis plugin entry over a fixed feature table.
 * @param name - entry name used by loader diagnostics.
 * @param features - feature table; the keys are the entry config's fields.
 * @returns the plugin entry a loader row or package export consumes.
 */
export function composeEntry(name: string, features: FeatureTable): PluginEntry {
  return {
    name,
    inject: [...new Set(Object.values(features).flatMap(feature => feature.inject ?? []))],
    Config: entrySchema(name, features),
    apply(ctx: Context, config: Record<string, unknown> = {}): void {
      for (const [key, feature] of Object.entries(features)) {
        try {
          feature.apply(ctx, config[key] ?? {})
        } catch (error: unknown) {
          ctx.logger.warn(`${name}: feature ${feature.name} (${key}) failed to mount: ${errorMessage(error)}`)
        }
      }
    },
  }
}

/** Aggregate per-feature schemas into one entry schema with per-field issues. */
function entrySchema(name: string, features: FeatureTable): StandardSchema<Record<string, unknown>> {
  return {
    '~standard': {
      version: 1,
      vendor: name,
      validate(value: unknown) {
        // A loader row without `config` resolves the schema with `undefined`;
        // absent config means every feature runs on its own defaults.
        if (value !== undefined && value !== null && (typeof value !== 'object' || Array.isArray(value))) {
          return { issues: [{ message: `${name}: config must be an object keyed by feature name` }] }
        }
        const raw: Record<string, unknown> = (value ?? {}) as Record<string, unknown>
        const issues: { message: string }[] = []
        for (const key of Object.keys(raw)) {
          if (!(key in features)) {
            issues.push({ message: `${name}: unknown feature key "${key}" (known: ${Object.keys(features).join(', ')})` })
          }
        }
        const normalized: Record<string, unknown> = {}
        for (const [key, feature] of Object.entries(features)) {
          const subtree = raw[key] ?? {}
          if (typeof subtree !== 'object' || subtree === null || Array.isArray(subtree)) {
            issues.push({ message: `${name}: config.${key} must be an object` })
            continue
          }
          const schema = feature.Config
          if (schema === undefined) {
            normalized[key] = subtree
            continue
          }
          const result = schema['~standard'].validate(subtree)
          if ('issues' in result) {
            for (const issue of result.issues) issues.push({ message: `${name}: config.${key}: ${issue.message}` })
            continue
          }
          normalized[key] = result.value
        }
        return issues.length > 0 ? { issues } : { value: normalized }
      },
    },
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
