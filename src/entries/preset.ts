/**
 * PTC-preset host entry (package `./preset` export, one row appended to the
 * shipped `ptc` agent preset by this bundle's patch): mounts the features that
 * belong to the preset's standing composition. Registrations made by these
 * features land in the preset's scope layer, so they are visible exactly to
 * agents of that preset — the structural "PTC mode only" isolation.
 *
 * @module dsh-better-ptc/entries/preset
 */

import { composeEntry } from '../support/entry.ts'
import { commands } from '../features/commands/index.ts'

export const { name, inject, Config, apply } = composeEntry('better-ptc-preset', { commands })
