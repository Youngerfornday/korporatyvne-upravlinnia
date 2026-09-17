/** Правило розподілу правильних відповідей у YAML-банках питань. */
import { WARNING, makeFinding } from '../finding.mjs';

export const RULE = 'bank-answer-position';

const POSITION_HINT = 'Переставте варіанти так, щоб правильні відповіді були розподілені між позиціями рівномірно; для truefalse чергуйте true і false.';

function questionLine(file, question) {
  return file.maps.find((node) => node.path.length === 1 && node.path[0] === 'questions' && node.keys.id === question.id)?.line ?? 1;
}

function answerIndex(question) {
  if (!Array.isArray(question.answers)) return -1;
  const correct = question.answers.findIndex((answer) => answer?.fraction === 100 || answer?.correct === true || answer?.is === true);
  return correct >= 0 && question.answers.filter((answer) => answer?.fraction === 100 || answer?.correct === true || answer?.is === true).length === 1 ? correct : -1;
}

function positionFinding(file, questions) {
  const eligible = questions.filter((question) => answerIndex(question) >= 0);
  if (eligible.length < 2) return [];
  const positions = new Map();
  for (const question of eligible) {
    const position = answerIndex(question);
    positions.set(position + 1, [...(positions.get(position + 1) ?? []), question]);
  }
  if (positions.size === 0) return [];
  const entry = [...positions.entries()].find(([, items]) => items.length / eligible.length > 0.45);
  if (!entry) return [];
  const [position, items] = entry;
  return [makeFinding({
    file: file.file,
    line: questionLine(file, items[0]),
    rule: RULE,
    level: WARNING,
    message: `Файл банку: правильна відповідь на позиції ${position} у ${items.length} з ${eligible.length} multichoice single питань (${Math.round(items.length / eligible.length * 100)}%); питання: ${items.map((question) => question.id).join(', ')}`,
    hint: POSITION_HINT,
  })];
}

function trueFalseFinding(file, questions) {
  if (questions.length < 2) return [];
  const values = new Set(questions.map((question) => question.correct));
  if (values.size !== 1) return [];
  return [makeFinding({
    file: file.file,
    line: questionLine(file, questions[0]),
    rule: RULE,
    level: WARNING,
    message: `Файл банку: у всіх ${questions.length} truefalse питань правильна відповідь однакова (${String(questions[0].correct)}); питання: ${questions.map((question) => question.id).join(', ')}`,
    hint: POSITION_HINT,
  })];
}

/** Перевіряє лише multichoice з single: true та truefalse у кожному переданому YAML-файлі. */
export function checkBankAnswerPosition(files) {
  return files.filter((file) => file.kind === 'yaml' && Array.isArray(file.data?.questions)).flatMap((file) => {
    const questions = file.data.questions;
    return [
      ...positionFinding(file, questions.filter((question) => question?.type === 'multichoice' && question.single === true)),
      ...trueFalseFinding(file, questions.filter((question) => question?.type === 'truefalse' && typeof question.correct === 'boolean')),
    ];
  });
}
