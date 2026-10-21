/**
 * Ignorable plugin records and the message projection that turns one of them
 * into a model-visible rewrite. A repair record never enters `SessionEventMap`;
 * it is an ignorable `plugin:` record, so a build without this plugin skips it
 * and still reads the session log. The registered projection changes the
 * rejected assistant message's tool-call arguments for model requests only.
 * @module @deepseek-ai/dsh-ptc-repair/records
 */
import type { RequestMessage, TokenUsage } from '@deepseek-ai/dsh-llm';
import type { ToolCallId } from '@deepseek-ai/dsh-llm';
import type { Session, SessionSeq } from '@deepseek-ai/dsh-session';
/** The provider route one auxiliary repair call used, recorded verbatim. */
export interface RepairRoute {
    /** Provider registration name. */
    readonly provider: string;
    /** Model id resolved for that provider. */
    readonly model: string;
}
/** An ignorable record type this plugin owns; the vocabulary is outside SessionEventMap. */
export type RepairRecordType = 'plugin:ptc-repair/request' | 'plugin:ptc-repair/repair' | 'plugin:ptc-repair/failed';
declare module '@deepseek-ai/dsh-session/types' {
    interface PluginRecordMap {
        /** The complete auxiliary repair request, logged before dispatch. */
        'plugin:ptc-repair/request': {
            callId: ToolCallId;
            route: RepairRoute;
            system: string;
            messages: RequestMessage[];
            maxTokens: number;
        };
        /**
         * A successful repair: the accepted replacement arguments and the assistant
         * surface node whose one tool call they rewrite. The program pair is absent
         * when only the missing `description` argument was repaired; the generated
         * description is present when that repair ran.
         */
        'plugin:ptc-repair/repair': {
            callId: ToolCallId;
            targetSeq: SessionSeq;
            route: RepairRoute;
            originalCode?: string;
            repairedCode?: string;
            repairedDescription?: string;
            argumentsJson: string;
            attempt: number;
            usage?: TokenUsage;
        };
        /** A repair attempt that produced no acceptable replacement. */
        'plugin:ptc-repair/failed': {
            callId: ToolCallId;
            route: RepairRoute;
            originalCode: string;
            reason: string;
            attempt: number;
        };
    }
}
/** Append one ignorable repair record to the owning session's log. */
export declare function appendRepairRequest(session: Session, data: {
    callId: ToolCallId;
    route: RepairRoute;
    system: string;
    messages: RequestMessage[];
    maxTokens: number;
}): SessionSeq;
/** Append one accepted-repair record; the projection makes it model-visible. */
export declare function appendRepairAccepted(session: Session, data: {
    callId: ToolCallId;
    targetSeq: SessionSeq;
    route: RepairRoute;
    originalCode?: string;
    repairedCode?: string;
    repairedDescription?: string;
    argumentsJson: string;
    attempt: number;
    usage?: TokenUsage;
}): SessionSeq;
/** Append one failed-attempt record; the rejected program still runs. */
export declare function appendRepairFailed(session: Session, data: {
    callId: ToolCallId;
    route: RepairRoute;
    originalCode: string;
    reason: string;
    attempt: number;
}): SessionSeq;
//# sourceMappingURL=records.d.ts.map