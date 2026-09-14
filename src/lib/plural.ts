/** Форми слова для українських категорій множинності; `other` — дробові числа (1,5 кредиту). */
export interface UkPluralForms {
  readonly one: string;
  readonly few: string;
  readonly many: string;
  readonly other: string;
}

const pluralRules = new Intl.PluralRules('uk');
const numberFormat = new Intl.NumberFormat('uk-UA');

/** «4 кредити», «5 кредитів», «1,5 кредиту». */
export function pluralUk(count: number, forms: UkPluralForms): string {
  const category = pluralRules.select(count);
  const word = category === 'one' || category === 'few' || category === 'many' ? forms[category] : forms.other;
  return `${numberFormat.format(count)} ${word}`;
}
