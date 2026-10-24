/**
 * Global host entry (package `.` export, loader row `better-ptc`): mounts the
 * features that belong to the host-global scope. Both features ride this one
 * row: repair hooks tool execution globally, and commands gate themselves per
 * agent by preset. Adding a global feature means adding it to this table —
 * the loader row and `cordis.patch.yml` never change.
 *
 * @module dsh-better-ptc/entries/global
 */
import { composeEntry } from "../support/entry.js";
import { repair } from "../features/repair/index.js";
import { commands } from "../features/commands/index.js";
export const { name, inject, Config, apply } = composeEntry('better-ptc-global', { repair, commands });
//# sourceMappingURL=global.js.map
