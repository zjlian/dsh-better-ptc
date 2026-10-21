/**
 * Model-facing text for the auxiliary repair calls and the acceptance rules for
 * their answers. Both prompts are deliberately narrow: one fixes syntax, the
 * other writes one missing UI label, and neither may silently redesign the
 * program the model wrote.
 * @module @deepseek-ai/dsh-ptc-repair/prompt
 */
import type { RequestMessage } from '@deepseek-ai/dsh-llm';
import type { CompileFailure } from './preflight.ts';
declare module '@deepseek-ai/dsh-llm' {
    interface MessageSourceMap {
        /** Input of the auxiliary PTC repair call, recorded only in this plugin's request record. */
        'ptc-repair': {
            kind: 'ptc-repair';
        };
    }
}
/**
 * The repair model's whole instruction. It names the program contract, the
 * exact repair scope, the non-erasable syntax the host rejects, and the output
 * form; anything else would invite a rewrite instead of a syntax fix.
 */
export declare const REPAIR_SYSTEM_PROMPT: string;
/**
 * Build the single user message of the repair call. The program and diagnostic
 * ride one JSON object so neither can break a structural delimiter.
 * @param program - the rejected program body.
 * @param failure - the host's compile diagnostic for that program.
 * @returns the framed repair request message.
 */
export declare function buildRepairMessage(program: string, failure: CompileFailure): RequestMessage;
/**
 * Extract a program body from the repair model's text output. A single outer
 * Markdown fence is tolerated (models add it despite instructions); everything
 * else is returned verbatim for acceptance to judge.
 * @param text - concatenated text blocks of the repair response.
 * @returns the candidate program, or `undefined` when the answer is empty.
 */
export declare function extractProgram(text: string): string | undefined;
/** Why a repaired candidate was rejected. */
export type CandidateRejection = 'empty' | 'unchanged' | 'too-large' | 'still-invalid';
/** Result of judging one repaired candidate. */
export type CandidateVerdict = {
    readonly ok: true;
    readonly program: string;
} | {
    readonly ok: false;
    readonly reason: CandidateRejection;
};
/**
 * Judge one candidate against the program it replaces.
 * @param original - the rejected program body.
 * @param candidate - the extracted repair answer, if any.
 * @param maxCodeGrowth - configured growth bound relative to `original`.
 * @returns the accepted program or the rejection reason.
 */
export declare function judgeCandidate(original: string, candidate: string | undefined, maxCodeGrowth: number): CandidateVerdict;
/**
 * Upper bound for an accepted generated description. The value is UI text for a
 * tool card, not program text: `run_code`'s own parameter description asks for
 * 5-10 words, so a longer answer is a summary the model did not keep controlled
 * and is rejected instead of committed.
 */
export declare const MAX_DESCRIPTION_CHARS = 200;
/**
 * The description model's whole instruction: what the argument is for, its
 * display contract, and the plain-text answer form. It sees one program and
 * writes one line, so anything broader invites it to reformat the program.
 */
export declare const DESCRIBE_SYSTEM_PROMPT: string;
/**
 * Build the single user message of the description call. The program rides a
 * JSON object so its text cannot break a structural delimiter.
 * @param program - the program whose description is missing.
 * @returns the framed description request message.
 */
export declare function buildDescribeMessage(program: string): RequestMessage;
/** Why a generated description was rejected. */
export type DescriptionRejection = 'empty' | 'multiline' | 'too-large';
/** Result of judging one generated description. */
export type DescriptionVerdict = {
    readonly ok: true;
    readonly description: string;
} | {
    readonly ok: false;
    readonly reason: DescriptionRejection;
};
/**
 * Extract a description from the description model's text output. A single
 * outer Markdown fence or a matching pair of wrapping quotes is tolerated
 * (models add them despite instructions); everything else is returned verbatim
 * for acceptance to judge.
 * @param text - concatenated text blocks of the description response.
 * @returns the candidate description, or `undefined` when the answer is empty.
 */
export declare function extractDescription(text: string): string | undefined;
/**
 * Judge one candidate against the UI contract of a description.
 * @param candidate - the extracted description answer, if any.
 * @returns the accepted description or the rejection reason.
 */
export declare function judgeDescription(candidate: string | undefined): DescriptionVerdict;
//# sourceMappingURL=prompt.d.ts.map