/**
 * Ignorable plugin records and the message projection that turns one of them
 * into a model-visible rewrite. A repair record never enters `SessionEventMap`;
 * it is an ignorable `plugin:` record, so a build without this plugin skips it
 * and still reads the session log. The registered projection changes the
 * rejected assistant message's tool-call arguments for model requests only.
 * @module @deepseek-ai/dsh-ptc-repair/records
 */
import { appendPluginRecord } from '@deepseek-ai/dsh-session';
/** Append one ignorable repair record to the owning session's log. */
export function appendRepairRequest(session, data) {
    return appendPluginRecord(session, 'plugin:ptc-repair/request', data);
}
/** Append one accepted-repair record; the projection makes it model-visible. */
export function appendRepairAccepted(session, data) {
    return appendPluginRecord(session, 'plugin:ptc-repair/repair', data);
}
/** Append one failed-attempt record; the rejected program still runs. */
export function appendRepairFailed(session, data) {
    return appendPluginRecord(session, 'plugin:ptc-repair/failed', data);
}
//# sourceMappingURL=records.js.map