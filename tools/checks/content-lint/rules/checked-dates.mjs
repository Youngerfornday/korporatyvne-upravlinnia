/**
 * Правило 4. Дати перевірки.
 * `checkedAt` у lawRef і в списках джерел не може бути в майбутньому, а для кодів legal-baseline
 * має збігатися з датою, яку фіксує сам документ: колонка «Перевірено» розділу «Ключові числа»,
 * інакше дата рядка чи розділу, інакше базова дата документа.
 */
import { expectedDates } from '../baseline.mjs';
import { ERROR, makeFinding } from '../finding.mjs';
import { lawRefsOf, sourceCheckedDates } from '../refs.mjs';

export const RULE = 'checked-date';
const FUTURE_HINT = 'Поставте дату, коли норму або джерело справді відкривали; майбутня дата означає неперевірене джерело.';
const MISMATCH_HINT = 'Візьміть дату з docs/research/legal-baseline.md (колонка «Перевірено» розділу «Ключові числа», інакше дата рядка або розділу, інакше базова дата документа) — або звірте норму заново і оновіть саму базу.';

export function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function futureIssue(file, line, date, today, what) {
  if (date <= today) return [];
  return [makeFinding({
    file: file.file, line, rule: RULE, level: ERROR,
    message: `${what}: дата перевірки ${date} у майбутньому (сьогодні ${today})`,
    hint: FUTURE_HINT,
  })];
}

/**
 * @param {import('../content.mjs').ContentFile[]} files
 * @param {ReturnType<import('../baseline.mjs').parseBaseline>} baseline
 * @param {string} today ISO-дата
 * @returns {import('../finding.mjs').Finding[]}
 */
export function checkCheckedDates(files, baseline, today = todayIso()) {
  return files.flatMap((file) => {
    const refs = lawRefsOf(file).flatMap((ref) => [
      ...futureIssue(file, ref.dateLine, ref.checkedAt, today, 'Посилання на норму'),
      ...ref.codes.flatMap((code) => {
        if (!baseline.codes.has(code)) return [];
        const allowed = expectedDates(baseline, code);
        if (allowed.has(ref.checkedAt)) return [];
        return [makeFinding({
          file: file.file, line: ref.dateLine, rule: RULE, level: ERROR,
          message: `Код ${code}: legal-baseline.md фіксує перевірку ${[...allowed].join(' або ')}, а в lawRef — ${ref.checkedAt}`,
          hint: MISMATCH_HINT,
          quote: ref.article,
        })];
      }),
    ]);
    const sources = sourceCheckedDates(file).flatMap((source) =>
      futureIssue(file, source.line, source.checkedAt, today, `Джерело «${source.id || source.title}»`),
    );
    return [...refs, ...sources];
  });
}
