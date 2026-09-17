/**
 * Оформлення глави Книги — атрибутами `style` на самих елементах.
 *
 * Чому не `<style>`: `toolbook_importhtml_parse_styles()` у Moodle 5.2.2 переносить із `<head>` лише
 * `<link rel="stylesheet">`, а блок `<style>` не переносить зовсім (перевірено: жодна глава після імпорту
 * не містить `<style>`). Атрибут `style` натомість переживає і імпорт, і очищення HTML при показі.
 *
 * Кольори — конкретні значення світлої теми сайту: змінних CSS у Moodle немає.
 */

const BOX = 'padding: 0.6em 1em; margin: 1.2em 0;';
const MUTED = 'font-size: 0.9em; color: #445570;';
const HEADING = 'font-weight: 700; color: #00305f;';
const CHIP = 'display: inline-block; font-size: 0.85em; color: #00305f; background: #eef4fa; padding: 0.1em 0.5em;';

/** Стиль за класом елемента сторінки теми. */
export const CLASS_STYLES: Readonly<Record<string, string>> = {
  norm: `border: 1px solid #d7e0ea; border-left: 4px solid #005b9f; background: #f7fafd; ${BOX}`,
  'norm-title': `${HEADING} margin-bottom: 0.3em;`,
  'norm-src': `${MUTED} margin-top: 0.5em;`,
  callout: `border: 1px solid #d7e0ea; border-left: 4px solid #867eb4; background: #f6f5fb; ${BOX}`,
  'callout-title': HEADING,
  formula: `border: 1px solid #d7e0ea; background: #fbfcfe; ${BOX} text-align: center;`,
  'formula-label': `display: block; ${HEADING}`,
  'formula-note': `display: block; ${MUTED}`,
  case: `border: 1px solid #d7e0ea; ${BOX}`,
  'case-tag': CHIP,
  chip: `${CHIP} margin-right: 0.4em;`,
  legend: 'list-style: none; padding-left: 0; text-align: left;',
  ref: `display: inline-block; min-width: 1.8em; ${HEADING}`,
  outcomes: 'list-style: none; padding-left: 0;',
  'srs-task': `border-left: 3px solid #d7e0ea; padding-left: 0.8em; margin: 0.8em 0;`,
  'ku-note': `border-left: 4px solid #005b9f; background: #eef4fa; ${BOX}`,
  'ku-details': `border: 1px dashed #d7e0ea; background: #fbfcfe; padding: 0.6em 1em; margin: 1em 0;`,
  'ku-summary': `${HEADING} margin: 0 0 0.4em;`,
  'ku-terms': 'border-top: 2px solid #005b9f; margin-top: 2em; padding-top: 0.8em;',
  'ku-term-ref': 'font-size: 0.75em;',
  muted: MUTED,
  small: MUTED,
};

/** Стиль за назвою тега. */
export const TAG_STYLES: Readonly<Record<string, string>> = {
  figure: 'margin: 1.4em 0; text-align: center;',
  figcaption: MUTED,
  table: 'border-collapse: collapse;',
  th: 'border: 1px solid #d7e0ea; padding: 0.4em 0.6em;',
  td: 'border: 1px solid #d7e0ea; padding: 0.4em 0.6em;',
};
