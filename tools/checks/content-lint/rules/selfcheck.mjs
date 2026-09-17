/**
 * Правила самоперевірки в lecture.mdx.
 * SelfCheck отримує JavaScript-літерал у JSX, тому для lint не виконуємо код:
 * розбираємо лише потрібну підмножину масивів, об'єктів, рядків і boolean-значень.
 */
import { WARNING, makeFinding } from '../finding.mjs';
import { normalizeText, quote } from '../text.mjs';

export const RULE_POSITION = 'selfcheck-answer-position';
export const RULE_LENGTH = 'selfcheck-answer-length';

const META = Symbol('selfcheck-source-position');
const SELF_CHECK = /<SelfCheck\b/g;

const POSITION_HINT = 'Для виправлення: перемішайте порядок варіантів у питаннях так, щоб правильні відповіді були розподілені між позиціями рівномірніше; порядок у файлі — порядок на екрані.';
const LENGTH_HINT = 'Перепишіть варіанти нейтрально: скорочуйте правильну відповідь і робіть дистрактори співмірними за довжиною; не давайте підказку формулюванням.';

function mark(value, start) {
  if (value !== null && typeof value === 'object') Object.defineProperty(value, META, { value: start });
  return value;
}

class LiteralParser {
  constructor(source, start) {
    this.source = source;
    this.index = start;
  }

  skip() {
    while (/\s/.test(this.source[this.index] ?? '')) this.index += 1;
  }

  value() {
    this.skip();
    const start = this.index;
    const character = this.source[this.index];
    if (character === '[') return this.array(start);
    if (character === '{') return this.object(start);
    if (character === "'" || character === '"' || character === '`') return this.string();
    const token = this.source.slice(this.index).match(/^[\w.-]+/)?.[0] ?? '';
    if (token === '') throw new Error('Невідоме значення в SelfCheck');
    this.index += token.length;
    if (token === 'true') return true;
    if (token === 'false') return false;
    if (token === 'null') return null;
    return token;
  }

  string() {
    const quoteCharacter = this.source[this.index];
    this.index += 1;
    let result = '';
    while (this.index < this.source.length) {
      const character = this.source[this.index++];
      if (character === quoteCharacter) return result;
      if (character !== '\\') {
        result += character;
        continue;
      }
      const escaped = this.source[this.index++];
      result += ({ n: '\n', r: '\r', t: '\t', b: '\b', f: '\f', v: '\v' }[escaped] ?? escaped);
    }
    throw new Error('Незакритий рядок у SelfCheck');
  }

  array(start) {
    this.index += 1;
    const result = [];
    this.skip();
    while (this.index < this.source.length && this.source[this.index] !== ']') {
      result.push(this.value());
      this.skip();
      if (this.source[this.index] === ',') this.index += 1;
      this.skip();
    }
    if (this.source[this.index] !== ']') throw new Error('Незакритий масив у SelfCheck');
    this.index += 1;
    return mark(result, start);
  }

  object(start) {
    this.index += 1;
    const result = {};
    this.skip();
    while (this.index < this.source.length && this.source[this.index] !== '}') {
      const key = this.source.slice(this.index).match(/^[\w$-]+/)?.[0];
      if (!key) throw new Error('Невідомий ключ у SelfCheck');
      this.index += key.length;
      this.skip();
      if (this.source[this.index] !== ':') throw new Error('Очікувалася двокрапка в SelfCheck');
      this.index += 1;
      result[key] = this.value();
      this.skip();
      if (this.source[this.index] === ',') this.index += 1;
      this.skip();
    }
    if (this.source[this.index] !== '}') throw new Error('Незакритий об’єкт у SelfCheck');
    this.index += 1;
    return mark(result, start);
  }
}

function lineAt(text, offset) {
  return text.slice(0, offset).split(/\r?\n/).length;
}

function topicFromPath(file) {
  return /(?:^|\/)modules\/[^/]+\/(t\d+)\//.exec(file.file)?.[1] ?? '';
}

function selfCheckArrays(file) {
  if (file.kind !== 'mdx') return [];
  const found = [];
  for (const tag of file.text.matchAll(SELF_CHECK)) {
    const tagEnd = file.text.indexOf('>', tag.index);
    if (tagEnd < 0) continue;
    const opening = /questions\s*=\s*\{/.exec(file.text.slice(tag.index, tagEnd));
    if (!opening) continue;
    const arrayStart = tag.index + opening.index + opening[0].length;
    const firstArrayCharacter = file.text.slice(arrayStart).search(/\[/);
    if (firstArrayCharacter < 0) continue;
    try {
      const parser = new LiteralParser(file.text, arrayStart + firstArrayCharacter);
      const questions = parser.value();
      if (Array.isArray(questions)) found.push({ file, topic: /\btopic="([^"]+)"/.exec(file.text.slice(tag.index, tagEnd))?.[1] ?? topicFromPath(file), questions });
    } catch {
      // Некоректний JSX окремо діагностує компілятор MDX; це правило не приховує ту помилку.
    }
  }
  return found;
}

function questionDetails(check) {
  return check.questions.flatMap((question, index) => {
    if (!question || typeof question !== 'object' || !Array.isArray(question.options)) return [];
    const options = question.options.filter((option) => option && typeof option === 'object' && typeof option.text === 'string');
    const correct = options.findIndex((option) => option.correct === true || option.is === true);
    if (correct < 0) return [];
    return [{
      number: index + 1,
      line: lineAt(check.file.text, question[META] ?? 0),
      stem: String(question.stem ?? question.text ?? `Питання ${index + 1}`),
      options,
      correct: options[correct],
      position: correct + 1,
    }];
  });
}

function groupedQuestions(files) {
  const groups = new Map();
  for (const check of files.flatMap(selfCheckArrays)) {
    const details = questionDetails(check).map((question) => ({ ...question, file: check.file, topic: check.topic }));
    if (details.length === 0) continue;
    groups.set(check.topic, [...(groups.get(check.topic) ?? []), ...details]);
  }
  return groups;
}

function dominant(items, threshold) {
  const byPosition = new Map();
  for (const item of items) byPosition.set(item.position, [...(byPosition.get(item.position) ?? []), item]);
  return [...byPosition.entries()].find(([, questions]) => questions.length / items.length > threshold);
}

/** Перевіряє, чи не підказує студенту одна й та сама позиція правильної відповіді. */
export function checkSelfcheckAnswerPosition(files) {
  return [...groupedQuestions(files)].flatMap(([topic, questions]) => {
    if (questions.length < 2) return [];
    const entry = dominant(questions, 0.6);
    if (!entry) return [];
    const [position, dominantQuestions] = entry;
    const first = dominantQuestions[0];
    return [makeFinding({
      file: first.file.file,
      line: first.line,
      rule: RULE_POSITION,
      level: WARNING,
      message: `Тема ${topic}: правильна відповідь на позиції ${position} у ${dominantQuestions.length} з ${questions.length} питань (${Math.round(dominantQuestions.length / questions.length * 100)}%); питання № ${dominantQuestions.map((question) => question.number).join(', ')}`,
      hint: POSITION_HINT,
      quote: quote(first.stem),
    })];
  });
}

/** Перевіряє дві довжини: підозріло довгу правильну відповідь і надто короткий дистрактор. */
export function checkSelfcheckAnswerLength(files) {
  return [...groupedQuestions(files)].flatMap(([topic, questions]) => {
    const findings = [];
    const longest = questions.filter((question) => {
      const correctLength = normalizeText(question.correct.text).length;
      return correctLength >= Math.max(...question.options.map((option) => normalizeText(option.text).length));
    });
    if (longest.length / questions.length > 0.5) {
      const first = longest[0];
      findings.push(makeFinding({
        file: first.file.file,
        line: first.line,
        rule: RULE_LENGTH,
        level: WARNING,
        message: `Тема ${topic}: правильна відповідь є найдовшою у ${longest.length} з ${questions.length} питань (${Math.round(longest.length / questions.length * 100)}%); питання № ${longest.map((question) => question.number).join(', ')}`,
        hint: LENGTH_HINT,
        quote: quote(first.stem),
      }));
    }
    for (const question of questions) {
      const correctLength = normalizeText(question.correct.text).length;
      const distractors = question.options.filter((option) => option !== question.correct);
      if (distractors.length === 0) continue;
      const shortest = Math.min(...distractors.map((option) => normalizeText(option.text).length));
      if (shortest >= correctLength * 0.6) continue;
      findings.push(makeFinding({
        file: question.file.file,
        line: question.line,
        rule: RULE_LENGTH,
        level: WARNING,
        message: `Тема ${topic}, питання № ${question.number}: правильна відповідь — ${correctLength} симв., найкоротший дистрактор — ${shortest} симв. (${Math.round(shortest / correctLength * 100)}%; потрібно не менше 60%)`,
        hint: LENGTH_HINT,
        quote: quote(question.stem),
      }));
    }
    return findings;
  });
}
