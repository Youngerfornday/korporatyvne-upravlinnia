import * as examples from '../../../src/content/schemas/__fixtures__/questions.ts';
import { BankFileSchema, QuestionSchema, type BankFile, type Question } from '../../../src/content/schemas/questions.ts';
import { banksToMoodleXml } from '../moodle-xml.ts';
import { REGISTRY } from '../__fixtures__/registry.ts';
import { childrenNamed, parseXml, type XmlNode } from './xml-tree.ts';

/** Будівники тестових банків на основі канонічних прикладів схеми (src/content/schemas/__fixtures__). */

export { examples };

export function question(raw: unknown): Question {
  return QuestionSchema.parse(raw);
}

export function bank(module: string, questions: readonly unknown[], extra: Partial<Pick<BankFile, 'kind' | 'canary'>> = {}): BankFile {
  return BankFileSchema.parse({ schemaVersion: 1, kind: 'training', module, questions, ...extra });
}

/** Модуль прикладу за темою в стабільному реєстрі. */
export function moduleOf(topic: string): string {
  const found = REGISTRY.topics.find((entry) => entry.id === topic);
  if (!found) throw new Error(`Тема ${topic} відсутня в тестовому реєстрі`);
  return found.module;
}

/** Сире питання з фікстур або з правками в тесті: теми достатньо, решту перевіряє схема. */
export type RawQuestion = { readonly topic: string } & Record<string, unknown>;

export function singleQuestionXml(raw: RawQuestion): string {
  return banksToMoodleXml([bank(moduleOf(raw.topic), [raw])], REGISTRY);
}

/** Розібраний `<question>` (не категорія) з XML банку з одним питанням. */
export function parsedQuestion(raw: RawQuestion): XmlNode {
  const questions = childrenNamed(parseXml(singleQuestionXml(raw)), 'question').filter(
    (node) => node.attributes.type !== 'category',
  );
  if (questions.length !== 1) throw new Error(`Очікувалося одне питання, знайдено ${questions.length}`);
  return questions[0] as XmlNode;
}

export function allExampleBanks(): BankFile[] {
  const raws = examples.allQuestionExamples();
  const modules = [...new Set(raws.map((raw) => moduleOf(raw.topic)))];
  return modules.map((module) => bank(module, raws.filter((raw) => moduleOf(raw.topic) === module)));
}
