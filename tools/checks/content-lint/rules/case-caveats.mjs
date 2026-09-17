/**
 * Правило 5. Застереження кейсів (`caveat` у реєстрі course.yaml).
 * Два типи застережень перевіряються автоматично:
 *  — «подавати як паралельні факти» — у реченні з назвою кейсу не може бути причинного сполучника;
 *  — «норми Закону № … відсутні в legal-baseline» — не можна описувати зміст цього закону.
 */
import { LAW_MENTION } from '../baseline.mjs';
import { refineLine } from '../content.mjs';
import { ERROR, makeFinding } from '../finding.mjs';
import { hasAnyStem, lower, quote, splitClauses, splitSentences } from '../text.mjs';

export const RULE = 'case-caveat';
const PARALLEL_HINT = 'Подавайте події як паралельні факти: «того ж року», «водночас» замість «через», «під тиском», «унаслідок» — причинний зв’язок джерелами не встановлено.';
const LAW_HINT = 'Не переказуйте зміст акта, якого немає в docs/research/legal-baseline.md: назвіть лише факт застосування або спершу доповніть базу першоджерелом.';

const CAUSAL_MARKERS = ['через', 'під тиском', 'штовха', 'змуси', 'змушу', 'унаслідок', 'внаслідок', 'спричин', 'призвів', 'призвел', 'зумовив', 'тому що'];
const CONTENT_MARKERS = ['передбача', 'встановлю', 'вимага', 'зобов’яз', 'дозволя', 'заборон', 'визнача', 'регулю', 'статт', 'ст. ', 'згідно з', 'відповідно до', 'норм'];
const PARALLEL_CAVEAT = ['паралельн'];
const ABSENT_MARKERS = ['відсутн', 'не знайдено', 'немає', 'не підтверджен'];
const COMMON_TITLE_WORDS = new Set(['реформа', 'компанія', 'криза', 'закон', 'кодекс', 'рада', 'ринок', 'справа', 'процес', 'звіт', 'модель', 'історія', 'приклад', 'виведення', 'наглядових', 'держкомпаній', 'операції', 'після', 'енергетичних']);
const EXEMPT_KEYS = new Set(['caveat']);
const MIN_ALIAS = 4;

/** Назви сутностей кейсу: латиниця, лапки і власні назви з початку заголовка. */
export function caseAliases(title) {
  const head = title.split(/\s+—\s+|\s+–\s+|:/)[0] ?? title;
  const quoted = [...title.matchAll(/[«"]([^»"]{3,})[»"]/g)].map(([, value]) => value);
  const words = [...head.matchAll(/[\p{L}][\p{L}\p{N}’-]*/gu)].map(([word]) => word);
  const proper = words.filter((word) => {
    if (word.length < MIN_ALIAS) return false;
    if (COMMON_TITLE_WORDS.has(lower(word))) return false;
    const isLatin = /^[A-Za-z][A-Za-z0-9-]*$/.test(word);
    const isProper = word[0] === word[0].toLocaleUpperCase('uk-UA');
    return isLatin || isProper;
  });
  return [...new Set([...proper, ...quoted].map((value) => lower(value)))];
}

/** Номери законів, зміст яких caveat забороняє переказувати. */
export function forbiddenLaws(caveat) {
  return splitSentences(caveat)
    .filter((sentence) => ABSENT_MARKERS.some((marker) => lower(sentence).includes(marker)))
    .flatMap((sentence) => [...sentence.matchAll(LAW_MENTION)].map(([, number]) => number.toUpperCase()));
}

/**
 * Другий орієнтир застереження — власні назви з самого caveat, крім назви кейсу.
 * Без нього будь-яке «через» поруч із назвою компанії ставало б помилкою, хоча caveat
 * забороняє лише конкретний причинний зв’язок (наприклад, «зміни в раді ← Кодекс КУ»).
 */
export function caveatTargets(caveat, aliases) {
  const words = [...caveat.matchAll(/[\p{Lu}][\p{L}\p{N}’-]{3,}/gu)].map(([word]) => lower(word));
  return [...new Set(words.map((word) => word.slice(0, 6)))].filter((word) => !aliases.some((alias) => alias.startsWith(word) || word.startsWith(alias.slice(0, 6))));
}

function describedCase(caseEntry) {
  const aliases = caseAliases(caseEntry.title);
  return {
    ...caseEntry,
    aliases,
    targets: caveatTargets(caseEntry.caveat ?? '', aliases),
    parallel: PARALLEL_CAVEAT.some((marker) => lower(caseEntry.caveat ?? '').includes(marker)),
    laws: [...new Set(forbiddenLaws(caseEntry.caveat ?? ''))],
  };
}

/**
 * @param {import('../content.mjs').ContentFile[]} files
 * @param {Array<{ id: string, title: string, caveat?: string }>} cases
 * @returns {import('../finding.mjs').Finding[]}
 */
export function checkCaseCaveats(files, cases) {
  const described = cases.map(describedCase).filter((item) => item.parallel || item.laws.length > 0);
  if (described.length === 0) return [];
  return files.flatMap((file) =>
    file.units.flatMap((unit) => {
      if (unit.key !== null && EXEMPT_KEYS.has(unit.key)) return [];
      return splitSentences(unit.text).flatMap((sentence) => splitClauses(sentence)).flatMap((clause) => {
        const sentence = clause;
        const text = lower(clause);
        const line = () => refineLine(file, unit, clause.slice(0, 40));
        return described.flatMap((item) => {
          const mentionsCase = item.parallel && hasAnyStem(sentence, item.aliases) && hasAnyStem(sentence, item.targets);
          const causal = mentionsCase && CAUSAL_MARKERS.filter((marker) => text.includes(marker));
          const parallelIssue = causal && causal.length > 0
            ? [makeFinding({
                file: file.file, line: line(), rule: RULE, level: ERROR,
                message: `Кейс «${item.id}»: caveat вимагає подавати факти як паралельні, а в реченні є причинний зв’язок («${causal.join('», «')}»)`,
                hint: `${PARALLEL_HINT} Caveat: «${quote(item.caveat, 200)}»`,
                quote: quote(sentence),
              })]
            : [];
          const lawIssue = item.laws
            .filter((number) => text.includes(lower(number)))
            .filter(() => CONTENT_MARKERS.some((marker) => text.includes(marker)))
            .map((number) => makeFinding({
              file: file.file, line: line(), rule: RULE, level: ERROR,
              message: `Кейс «${item.id}»: caveat каже, що норм Закону № ${number} немає в legal-baseline.md, а речення переказує його зміст`,
              hint: `${LAW_HINT} Caveat: «${quote(item.caveat, 200)}»`,
              quote: quote(sentence),
            }));
          return [...parallelIssue, ...lawIssue];
        });
      });
    }),
  );
}
