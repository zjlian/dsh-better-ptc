/**
 * Global host entry (package `.` export, loader row `better-ptc`): mounts the
 * features that belong to the host-global scope. Adding a global feature means
 * adding it to this table — the loader row and `cordis.patch.yml` never change.
 *
 * @module dsh-better-ptc/entries/global
 */
import { composeEntry } from "../support/entry.js";
import { repair } from "../features/repair/index.js";
export const { name, inject, Config, apply } = composeEntry('better-ptc-global', { repair });
//# sourceMappingURL=global.js.map