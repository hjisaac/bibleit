import { describe, it } from 'node:test';
import assert from 'node:assert';
import { LocaleEnum } from '@bibleit/engine';
import {
  TRANSLATE_TO_ENGLISH_SYSTEM_PROMPT,
  ANSWER_SYSTEM_PROMPT,
  LANGUAGE_DIRECTIVES,
  ANSWER_INSTRUCTIONS,
  getAnswerSystemPrompt,
  buildAnswerPrompt,
} from '../src/prompts';

describe('prompts', () => {
  it('indexes language directives and instructions by locale', () => {
    assert.ok(LANGUAGE_DIRECTIVES[LocaleEnum.FR].includes('français'));
    assert.ok(LANGUAGE_DIRECTIVES[LocaleEnum.EN].includes('English'));
    assert.ok(ANSWER_INSTRUCTIONS[LocaleEnum.FR].includes('French'));
    assert.ok(ANSWER_INSTRUCTIONS[LocaleEnum.EN].includes('Direct answer'));
  });

  it('exports translation system prompt with natural query instruction', () => {
    assert.ok(TRANSLATE_TO_ENGLISH_SYSTEM_PROMPT.includes('natural English search query'));
    assert.ok(!TRANSLATE_TO_ENGLISH_SYSTEM_PROMPT.includes('concise English keywords'));
  });

  it('generates system answer prompt with French language instruction for French locale', () => {
    const frPrompt = getAnswerSystemPrompt('fr');
    assert.ok(frPrompt.includes('rédige la réponse en français'));
    assert.ok(frPrompt.includes(ANSWER_SYSTEM_PROMPT));

    const enPrompt = getAnswerSystemPrompt('en');
    assert.ok(enPrompt.includes('Respond in English'));
    assert.ok(enPrompt.includes(ANSWER_SYSTEM_PROMPT));
  });

  it('builds answer user prompt including passage context and query', () => {
    const passages = [
      {
        chunk: {
          id: 'BSB_GEN_1_1',
          book: 'GEN',
          start: [1, 1],
          end: [1, 1],
          text: 'In the beginning God created the heavens and the earth.',
        },
        score: 0.95,
      },
    ];

    const promptEn = buildAnswerPrompt('creation', passages as any, 'en');
    assert.ok(promptEn.includes('In the beginning'));
    assert.ok(promptEn.includes('Topic / Question: creation'));
    assert.ok(promptEn.includes('Direct answer'));

    const promptFr = buildAnswerPrompt('création', passages as any, 'fr');
    assert.ok(promptFr.includes('Direct answer in French'));
  });
});
