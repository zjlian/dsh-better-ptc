/**
 * Locate the assistant surface node a model-direct `run_code` call came from,
 * following the current surface so a prior rewrite or sibling repair is found
 * instead of its shadowed original.
 * @module @deepseek-ai/dsh-ptc-repair/history
 */
import type { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { Session, SessionSeq } from '@deepseek-ai/dsh-session';
import type { SessionEventMap } from '@deepseek-ai/dsh-session/types';
/** The current surface node carrying the assistant message that requested one call. */
export interface CallingAssistant {
    /** Sequence of the current surface node. */
    readonly seq: SessionSeq;
    /** The current node's data. */
    readonly data: SessionEventMap['assistant/message'];
}
/**
 * Find the assistant message a call came from.
 * @param session - the session owning the in-flight call.
 * @param callId - the call whose requesting assistant message is wanted.
 * @returns the current assistant surface node, or `undefined` when absent.
 */
export declare function findCallingAssistant(session: Session, callId: ToolCallId): CallingAssistant | undefined;
//# sourceMappingURL=history.d.ts.map