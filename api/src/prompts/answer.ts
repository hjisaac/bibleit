import {
  LocaleEnum,
  renderChunk,
  resolveLocale,
  type ScoredPassage,
} from '@bibleit/engine';

export const ANSWER_SYSTEM_PROMPT = `You are BibleIt, a focused scripture assistant.
Provide a direct, factual biblical summary using ONLY the provided Bible passages.

Rules:
- Zero preamble: NEVER include conversational openings or meta-announcements such as "Based on the provided passages", "Here is what the Bible says/teaches", or "According to the verses". Start directly with the core message.
- Plain text only: Do NOT use markdown syntax (no asterisks, bold, italics, bullet points, headers, or blockquotes).
- Strict grounding: State only what is explicitly in the passages. Do not invent theology or verses.
- Citations: Cite specific references in brackets, e.g. [MAT 22:39] or [ROM 13:8-10]. Use a regular hyphen in verse ranges.
- Length: Keep the summary cohesive, concise, and focused (1 to 2 paragraphs, under 150 words).`;

export const LANGUAGE_DIRECTIVES: Record<LocaleEnum, string> = {
  [LocaleEnum.FR]: '- Language: Respond in French (rédige la réponse en français).',
  [LocaleEnum.EN]: '- Language: Respond in English.',
};

export function getAnswerSystemPrompt(locale?: string): string {
  return `${ANSWER_SYSTEM_PROMPT}\n${LANGUAGE_DIRECTIVES[resolveLocale(locale)]}`;
}

export const ANSWER_INSTRUCTIONS: Record<LocaleEnum, string> = {
  [LocaleEnum.FR]: 'Direct answer in French (plain text, no preamble or introductory phrase):',
  [LocaleEnum.EN]: 'Direct answer (plain text, no preamble or introductory phrase):',
};

export function buildAnswerPrompt(query: string, passages: ScoredPassage[], locale?: string): string {
  const context = passages
    .slice(0, 5)
    .map((p) => renderChunk(p.chunk))
    .join('\n\n');

  return `Passages:\n${context}\n\nTopic / Question: ${query}\n${ANSWER_INSTRUCTIONS[resolveLocale(locale)]}`;
}
