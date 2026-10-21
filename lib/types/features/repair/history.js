/**
 * Locate the assistant surface node a model-direct `run_code` call came from,
 * following the current surface so a prior rewrite or sibling repair is found
 * instead of its shadowed original.
 * @module @deepseek-ai/dsh-ptc-repair/history
 */
/**
 * Find the assistant message a call came from.
 * @param session - the session owning the in-flight call.
 * @param callId - the call whose requesting assistant message is wanted.
 * @returns the current assistant surface node, or `undefined` when absent.
 */
export function findCallingAssistant(session, callId) {
    const nodes = session.surface.nodes;
    const events = session.snapshotEvents();
    for (let index = nodes.length - 1; index >= 0; index--) {
        const seq = nodes[index];
        if (seq === undefined)
            continue;
        const event = events[seq];
        if (event?.type !== 'assistant/message')
            continue;
        if (!event.data.message.content.some(block => block.type === 'tool-call' && block.id === callId))
            continue;
        return { seq, data: event.data };
    }
    return undefined;
}
//# sourceMappingURL=history.js.map