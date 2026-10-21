/**
 * The registered message projection that makes one ignorable repair record
 * change the rejected assistant message for model requests. The projection
 * validates the record against the history it presumes and returns immutable
 * message copies keyed by their original sequence; the durable event itself is
 * never modified.
 * @module @deepseek-ai/dsh-ptc-repair/projection
 */

import type { Message } from '@deepseek-ai/dsh-llm'
import type { SessionEvent, SessionSeq } from '@deepseek-ai/dsh-session/types'
import type { SessionMessageProjection } from '@deepseek-ai/dsh-session/surface'
import { deepFreeze } from '@deepseek-ai/dsh-util-values'

/** The record type whose consumer is this projection. */
export const REPAIR_RECORD = 'plugin:ptc-repair/repair'

/** The validated payload a repair projection reads from one record. */
interface RepairRecordData {
  readonly callId: string
  readonly targetSeq: SessionSeq
  readonly argumentsJson: string
}

/** Whether a durable value is a JSON object. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Whether a durable value is a non-negative safe integer. */
function isSeq(value: unknown): value is SessionSeq {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && !Object.is(value, -0)
}

/** Whether one raw arguments string encodes a JSON object, the only form a tool call may carry. */
function isArgumentsJson(json: string): boolean {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return false
  }
  return isRecord(parsed)
}

/**
 * Validate one repair record payload, naming the violated field. Audit-only
 * fields of earlier record revisions (the rejected and accepted program) are
 * deliberately not read: a description repair does not touch the program, so
 * requiring them would reject a valid record.
 */
function repairDataOf(value: unknown): RepairRecordData {
  if (!isRecord(value)) throw new Error('ptc-repair: repair record data must be an object')
  const { callId, targetSeq, argumentsJson } = value
  if (typeof callId !== 'string' || callId.length === 0) throw new Error('ptc-repair: repair record needs a callId')
  if (!isSeq(targetSeq)) throw new Error('ptc-repair: repair record needs a targetSeq')
  if (typeof argumentsJson !== 'string' || argumentsJson.length === 0) throw new Error('ptc-repair: repair record needs argumentsJson')
  if (!isArgumentsJson(argumentsJson)) throw new Error('ptc-repair: repair record argumentsJson must encode a JSON argument object')
  return { callId, targetSeq, argumentsJson }
}

/**
 * Apply one repair record to the current surface: the assistant message at
 * `targetSeq` must still be a current node whose content holds the recorded
 * call, and only that call's raw arguments change.
 */
export const repairProjection: SessionMessageProjection = {
  type: REPAIR_RECORD as SessionMessageProjection['type'],
  project(event: SessionEvent, context): ReadonlyMap<SessionSeq, Message> {
    const data = repairDataOf(event.data)
    if (!context.nodes.includes(data.targetSeq)) {
      throw new Error(`ptc-repair: repair target seq ${data.targetSeq} is not a current surface node`)
    }
    if (data.targetSeq >= event.seq) {
      throw new Error('ptc-repair: repair target must precede its record')
    }
    const source = context.events[data.targetSeq - context.baseSeq]
    if (source?.type !== 'assistant/message') {
      throw new Error(`ptc-repair: repair target seq ${data.targetSeq} is not an assistant message`)
    }
    const current: Message = context.messages.get(data.targetSeq) ?? source.data.message
    let matched = false
    const content = current.content.map(block => {
      if (block.type !== 'tool-call' || block.id !== data.callId) return block
      matched = true
      return { ...block, arguments: data.argumentsJson }
    })
    if (!matched) {
      throw new Error(`ptc-repair: repair target seq ${data.targetSeq} does not hold call ${data.callId}`)
    }
    return new Map([[data.targetSeq, deepFreeze({ ...current, content })]])
  },
}
