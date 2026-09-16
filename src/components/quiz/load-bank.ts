/**
 * Питання тренувального тесту теми з публічних банків (`content/banks/training/*.yaml`).
 * Для E2E (`KU_E2E_BANK=1` під час збірки у e2e/site/astro.config.mjs) тема 1 отримує лише фікстурний банк
 * замість реального — сценарії e2e не залежать від того, чи вже написано content/banks/training/m1.yaml;
 * продакшн-збірка змінну не ставить.
 */
import { getCollection } from 'astro:content';
import type { Question } from '../../content/schemas/questions';
import { E2E_BANK_TOPIC, e2eBankQuestions } from './__fixtures__/e2e-bank';

export const QUIZ_QUESTIONS_PER_TOPIC = 15;

function isE2eBankEnabled(): boolean {
  return typeof process !== 'undefined' && process.env['KU_E2E_BANK'] === '1';
}

export async function loadTopicQuestions(topicId: string): Promise<readonly Question[]> {
  if (isE2eBankEnabled() && topicId === E2E_BANK_TOPIC) return e2eBankQuestions();
  const banks = await getCollection('trainingBanks');
  return banks.flatMap((bank) => bank.data.questions).filter((question) => question.topic === topicId);
}

/** Скільки тем уже мають тренувальний тест — для списку тестів і навігації. */
export async function loadQuestionCounts(): Promise<ReadonlyMap<string, number>> {
  const banks = await getCollection('trainingBanks');
  const counts = new Map<string, number>();
  for (const question of banks.flatMap((bank) => bank.data.questions)) {
    counts.set(question.topic, (counts.get(question.topic) ?? 0) + 1);
  }
  if (isE2eBankEnabled()) counts.set(E2E_BANK_TOPIC, e2eBankQuestions().length);
  return counts;
}
