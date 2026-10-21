/**
 * The registered message projection that makes one ignorable repair record
 * change the rejected assistant message for model requests. The projection
 * validates the record against the history it presumes and returns immutable
 * message copies keyed by their original sequence; the durable event itself is
 * never modified.
 * @module @deepseek-ai/dsh-ptc-repair/projection
 */
import type { SessionMessageProjection } from '@deepseek-ai/dsh-session/surface';
/** The record type whose consumer is this projection. */
export declare const REPAIR_RECORD = "plugin:ptc-repair/repair";
/**
 * Apply one repair record to the current surface: the assistant message at
 * `targetSeq` must still be a current node whose content holds the recorded
 * call, and only that call's raw arguments change.
 */
export declare const repairProjection: SessionMessageProjection;
//# sourceMappingURL=projection.d.ts.map